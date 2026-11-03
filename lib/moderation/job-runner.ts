import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeCommentWithAI } from '@/lib/ai/moderator';
import { decryptToken } from '@/lib/crypto/token-encryption';
import { hideFacebookComment } from '@/lib/facebook/graph-api';
import { Database } from '@/types/database';

/**
 * Processes a single moderation job by ID.
 * Invoked asynchronously by background workers or webhook handlers.
 */
export async function processModerationJob(jobId: string): Promise<{
  success: boolean;
  status: string;
  error?: string;
}> {
  const supabase = createAdminClient();

  // 1. Fetch the job and lock it to 'processing'
  const { data: job, error: jobError } = await supabase
    .from('moderation_jobs')
    .select('*, comments(*, facebook_pages(*), posts(*))')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return { success: false, status: 'not_found', error: 'Job not found in database' };
  }

  // Mark job as processing
  await supabase
    .from('moderation_jobs')
    .update({
      status: 'processing',
      attempts: (job.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  const comment = (job as any).comments;
  if (!comment) {
    await supabase
      .from('moderation_jobs')
      .update({
        status: 'failed',
        last_error: 'Associated comment does not exist',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return { success: false, status: 'failed', error: 'Associated comment missing' };
  }

  const page = comment.facebook_pages;
  const post = comment.posts;

  try {
    // 2. Run AI Moderation Analysis
    const aiResult = await analyzeCommentWithAI({
      commentText: comment.message,
      commenterName: comment.commenter_name,
      postContext: post?.message,
      pageName: page?.name,
    });

    // 3. Upsert Moderation Result record
    await supabase.from('moderation_results').upsert({
      comment_id: comment.id,
      detected_category: aiResult.detectedCategory,
      confidence_score: aiResult.confidenceScore,
      severity: aiResult.severity,
      recommended_action: aiResult.recommendedAction,
      explanation: aiResult.explanation,
      detected_language: aiResult.detectedLanguage,
      model_info: aiResult.modelInfo,
      raw_response: aiResult.rawResponse,
    });

    // 4. Apply Moderation Rules & Actions based on Page Settings
    let nextStatus: Database['public']['Tables']['comments']['Row']['moderation_status'] = 'review_required';

    if (aiResult.recommendedAction === 'approve' && page?.auto_approve_safe) {
      nextStatus = 'approved';

      await supabase.from('comments').update({
        moderation_status: 'approved',
        updated_at: new Date().toISOString(),
      }).eq('id', comment.id);

      await supabase.from('moderation_actions').insert({
        comment_id: comment.id,
        action: 'approved',
        reason: `Auto-approved by AI (${aiResult.explanation})`,
        actor_type: 'ai',
        outcome: 'success',
      });
    } else if (aiResult.severity === 'critical' || aiResult.recommendedAction === 'alert') {
      nextStatus = 'review_required';

      await supabase.from('comments').update({
        moderation_status: 'review_required',
        updated_at: new Date().toISOString(),
      }).eq('id', comment.id);

      // Create high-priority threat notification
      await supabase.from('notifications').insert({
        title: 'CRITICAL THREAT DETECTED',
        message: `High severity threat on "${page?.name || 'Church Page'}": "${comment.message.slice(0, 100)}"`,
        type: 'threat',
        severity: 'critical',
        comment_id: comment.id,
        page_id: comment.page_id,
        is_read: false,
      });

      await supabase.from('moderation_actions').insert({
        comment_id: comment.id,
        action: 'threat_alerted',
        reason: `Critical threat detected by AI: ${aiResult.explanation}`,
        actor_type: 'ai',
        outcome: 'success',
      });
    } else if (aiResult.recommendedAction === 'hide') {
      // Automatic hiding is disabled by default unless explicitly turned on for this page
      if (page?.auto_hide_enabled && aiResult.confidenceScore >= 0.85) {
        // Fetch decrypted page access token
        const { data: tokenRow } = await supabase
          .from('page_tokens')
          .select('encrypted_access_token')
          .eq('page_id', page.id)
          .single();

        if (tokenRow?.encrypted_access_token) {
          try {
            const pageToken = decryptToken(tokenRow.encrypted_access_token);
            const fbResult = await hideFacebookComment(comment.facebook_comment_id, pageToken);

            if (fbResult.success) {
              await supabase.from('comments').update({
                is_hidden: true,
                moderation_status: 'hidden',
                updated_at: new Date().toISOString(),
              }).eq('id', comment.id);

              await supabase.from('moderation_actions').insert({
                comment_id: comment.id,
                action: 'hidden',
                reason: `Auto-hidden via Meta API: ${aiResult.explanation}`,
                actor_type: 'ai',
                api_response: fbResult.data,
                outcome: 'success',
              });
              nextStatus = 'hidden';
            } else {
              // Facebook API failed, record failure and keep in review queue
              await supabase.from('moderation_actions').insert({
                comment_id: comment.id,
                action: 'hidden',
                reason: `Auto-hide attempt failed: ${fbResult.error}`,
                actor_type: 'ai',
                outcome: 'failed',
              });

              await supabase.from('notifications').insert({
                title: 'Facebook Action Failed',
                message: `Failed to auto-hide comment on Facebook: ${fbResult.error}`,
                type: 'integration_error',
                severity: 'high',
                comment_id: comment.id,
                page_id: comment.page_id,
              });
            }
          } catch (tokenErr: any) {
            console.error('Error decrypting token for auto-hide:', tokenErr);
          }
        }
      } else {
        // Safe default: send to human review queue
        await supabase.from('comments').update({
          moderation_status: 'review_required',
          updated_at: new Date().toISOString(),
        }).eq('id', comment.id);

        await supabase.from('notifications').insert({
          title: 'Harmful Comment Awaiting Review',
          message: `Category: ${aiResult.detectedCategory} detected on ${page?.name || 'Page'}.`,
          type: 'review_required',
          severity: aiResult.severity,
          comment_id: comment.id,
          page_id: comment.page_id,
        });
      }
    } else {
      // Other categories: Flag or Human Review
      await supabase.from('comments').update({
        moderation_status: 'review_required',
        updated_at: new Date().toISOString(),
      }).eq('id', comment.id);
    }

    // Mark job as completed
    await supabase
      .from('moderation_jobs')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return { success: true, status: 'completed' };
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error during job processing';
    console.error(`Moderation job ${jobId} failed:`, errorMsg);

    const isMaxAttempts = (job.attempts || 0) + 1 >= (job.max_attempts || 3);
    await supabase
      .from('moderation_jobs')
      .update({
        status: isMaxAttempts ? 'failed' : 'pending',
        last_error: errorMsg,
        // Exponential backoff for retries: 2^attempts * 60 seconds
        next_run_at: new Date(Date.now() + Math.pow(2, job.attempts || 1) * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (isMaxAttempts) {
      await supabase.from('notifications').insert({
        title: 'Moderation Job Failed Permanently',
        message: `Job for comment ${comment.facebook_comment_id} failed after maximum retry attempts. Error: ${errorMsg}`,
        type: 'job_failure',
        severity: 'high',
        comment_id: comment.id,
        page_id: comment.page_id,
      });
    }

    return { success: false, status: 'failed', error: errorMsg };
  }
}
