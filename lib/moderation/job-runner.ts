import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeCommentWithAI } from '@/lib/ai/moderator';
import { decryptToken } from '@/lib/crypto/token-encryption';
import { hideFacebookComment } from '@/lib/facebook/graph-api';
import { Database } from '@/types/database';

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;
type NotificationInsert = Omit<
  Database['public']['Tables']['notifications']['Insert'],
  'admin_id'
>;

async function notifyActiveAdmins(
  supabase: AdminSupabaseClient,
  notification: NotificationInsert
): Promise<string | null> {
  const { data: admins, error: adminsError } = await supabase
    .from('admin_users')
    .select('id')
    .eq('is_active', true);
  if (adminsError) return `Failed to load active admins: ${adminsError.message}`;
  if (!admins || admins.length === 0) return null;

  const { error } = await supabase.from('notifications').insert(
    admins.map(({ id }) => ({ ...notification, admin_id: id }))
  );
  return error?.message || null;
}

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
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError) {
    return { success: false, status: 'lookup_failed', error: `Failed to load job: ${jobError.message}` };
  }
  if (!job) return { success: false, status: 'not_found', error: 'Job not found in database' };

  const { data: claimedJob, error: claimError } = await supabase
    .from('moderation_jobs')
    .update({
      status: 'processing',
      attempts: (job.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (claimError) {
    return { success: false, status: 'claim_failed', error: `Failed to claim moderation job: ${claimError.message}` };
  }
  if (!claimedJob) {
    return {
      success: false,
      status: job.status,
      error: `Moderation job is not pending (current status: ${job.status}).`,
    };
  }
  const activeJob = claimedJob;

  const { data: comment, error: commentError } = await supabase
    .from('comments')
    .select('*')
    .eq('id', job.comment_id)
    .maybeSingle();

  if (commentError || !comment) {
    const { error: failJobError } = await supabase
    .from('moderation_jobs')
    .update({
      status: 'failed',
      last_error: commentError?.message || 'Associated comment does not exist',
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
    const error = commentError?.message || 'Associated comment missing';
    return {
      success: false,
      status: 'failed',
      error: failJobError ? `${error}; additionally failed to update job status: ${failJobError.message}` : error,
    };
  }

  let post: Database['public']['Tables']['posts']['Row'] | null = null;
  let page: Database['public']['Tables']['facebook_pages']['Row'] | null = null;
  try {
    if (comment.post_id) {
      const { data, error } = await supabase.from('posts').select('*').eq('id', comment.post_id).maybeSingle();
      if (error) throw new Error(`Failed to load comment post: ${error.message}`);
      post = data;
    }
    if (post) {
      const { data, error } = await supabase.from('facebook_pages').select('*').eq('id', post.page_id).maybeSingle();
      if (error) throw new Error(`Failed to load comment Page: ${error.message}`);
      page = data;
    }

    // 2. Run AI Moderation Analysis
    const aiResult = await analyzeCommentWithAI({
      commentText: comment.message,
      commenterName: comment.commenter_name,
      postContext: post?.message,
      pageName: page?.name,
    });

    // 3. Upsert Moderation Result record
    const moderationResult = {
      category: aiResult.detectedCategory,
      confidence_score: aiResult.confidenceScore,
      severity: aiResult.severity,
      recommended_action: aiResult.recommendedAction,
      explanation: aiResult.explanation,
      detected_language: aiResult.detectedLanguage,
      model_name: aiResult.modelInfo,
      model_version: null,
    };
    const { data: existingResult, error: existingResultError } = await supabase
      .from('moderation_results')
      .select('id')
      .eq('comment_id', comment.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingResultError) {
      throw new Error(`Failed to load existing moderation result: ${existingResultError.message}`);
    }

    const { error: resultError } = existingResult
      ? await supabase
        .from('moderation_results')
        .update(moderationResult)
        .eq('id', existingResult.id)
      : await supabase.from('moderation_results').insert({
        comment_id: comment.id,
        ...moderationResult,
      });
    if (resultError) throw new Error(`Failed to save moderation result: ${resultError.message}`);

    // 4. Apply Moderation Rules & Actions based on Page Settings
    let nextStatus: Database['public']['Tables']['comments']['Row']['moderation_status'] = 'review_required';

    if (aiResult.recommendedAction === 'approve' && page?.auto_approve_safe) {
      nextStatus = 'approved';

      const { error: commentUpdateError } = await supabase.from('comments').update({
        moderation_status: 'approved',
        updated_at: new Date().toISOString(),
      }).eq('id', comment.id);
      if (commentUpdateError) throw new Error(`Failed to update approved comment: ${commentUpdateError.message}`);

      const { error: actionError } = await supabase.from('moderation_actions').insert({
        comment_id: comment.id,
        action_type: 'approved',
        reason: `Auto-approved by AI (${aiResult.explanation})`,
        action_status: 'success',
        performed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      if (actionError) throw new Error(`Failed to record AI approval action: ${actionError.message}`);
    } else if (aiResult.severity === 'critical' || aiResult.recommendedAction === 'alert') {
      nextStatus = 'review_required';

      const { error: commentUpdateError } = await supabase.from('comments').update({
        moderation_status: 'review_required',
        updated_at: new Date().toISOString(),
      }).eq('id', comment.id);
      if (commentUpdateError) throw new Error(`Failed to update review-required comment: ${commentUpdateError.message}`);

      // Create high-priority threat notification
      const notificationError = await notifyActiveAdmins(supabase, {
        title: 'CRITICAL THREAT DETECTED',
        message: `High severity threat on "${page?.name || 'Church Page'}": "${comment.message.slice(0, 100)}"`,
        notification_type: 'threat',
        related_comment_id: comment.id,
        is_read: false,
      });
      if (notificationError) console.error(`Failed to create threat notification for comment ${comment.id}: ${notificationError}`);

      const { error: actionError } = await supabase.from('moderation_actions').insert({
        comment_id: comment.id,
        action_type: 'threat_alerted',
        reason: `Critical threat detected by AI: ${aiResult.explanation}`,
        action_status: 'success',
        performed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      if (actionError) throw new Error(`Failed to record AI threat action: ${actionError.message}`);
    } else if (aiResult.recommendedAction === 'hide') {
      // Automatic hiding is disabled by default unless explicitly turned on for this page
      if (page?.auto_hide_enabled && aiResult.confidenceScore >= 0.85) {
        // Fetch decrypted page access token
        const { data: tokenRow, error: tokenError } = await supabase
          .from('page_tokens')
          .select('encrypted_access_token')
          .eq('page_id', page.id)
          .maybeSingle();
        if (tokenError) throw new Error(`Failed to load Page token: ${tokenError.message}`);

        if (tokenRow?.encrypted_access_token) {
          try {
            const pageToken = decryptToken(tokenRow.encrypted_access_token);
            const fbResult = await hideFacebookComment(comment.facebook_comment_id, pageToken);

            if (fbResult.success) {
              const { error: commentUpdateError } = await supabase.from('comments').update({
                is_hidden: true,
                moderation_status: 'hidden',
                updated_at: new Date().toISOString(),
              }).eq('id', comment.id);
              if (commentUpdateError) throw new Error(`Facebook hid the comment but updating its internal state failed: ${commentUpdateError.message}`);

              const { error: actionError } = await supabase.from('moderation_actions').insert({
                comment_id: comment.id,
                action_type: 'hidden',
                reason: `Auto-hidden via Meta API: ${aiResult.explanation}`,
                action_status: 'success',
                facebook_response: fbResult.data,
                performed_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              });
              if (actionError) throw new Error(`Facebook hid the comment but recording its action failed: ${actionError.message}`);
              nextStatus = 'hidden';
            } else {
              // Facebook API failed, record failure and keep in review queue
              const { error: actionError } = await supabase.from('moderation_actions').insert({
                comment_id: comment.id,
                action_type: 'hidden',
                reason: `Auto-hide attempt failed: ${fbResult.error}`,
                action_status: 'failed',
                error_message: fbResult.error,
                performed_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              });
              if (actionError) throw new Error(`Failed to record the failed Facebook hide: ${actionError.message}`);

              const notificationError = await notifyActiveAdmins(supabase, {
                title: 'Facebook Action Failed',
                message: `Failed to auto-hide comment on Facebook: ${fbResult.error}`,
                notification_type: 'integration_error',
                related_comment_id: comment.id,
              });
              if (notificationError) console.error(`Failed to notify admins of Facebook hide failure for comment ${comment.id}: ${notificationError}`);
            }
          } catch (tokenErr: any) {
            console.error('Error decrypting token for auto-hide:', tokenErr);
          }
        }
      } else {
        // Safe default: send to human review queue
        const { error: commentUpdateError } = await supabase.from('comments').update({
          moderation_status: 'review_required',
          updated_at: new Date().toISOString(),
        }).eq('id', comment.id);
        if (commentUpdateError) throw new Error(`Failed to route harmful comment to human review: ${commentUpdateError.message}`);

        const notificationError = await notifyActiveAdmins(supabase, {
          title: 'Harmful Comment Awaiting Review',
          message: `Category: ${aiResult.detectedCategory} detected on ${page?.name || 'Page'}.`,
          notification_type: 'review_required',
          related_comment_id: comment.id,
        });
        if (notificationError) console.error(`Failed to notify admins about comment ${comment.id}: ${notificationError}`);
      }
    } else {
      // Other categories: Flag or Human Review
      const { error: commentUpdateError } = await supabase.from('comments').update({
        moderation_status: 'review_required',
        updated_at: new Date().toISOString(),
      }).eq('id', comment.id);
      if (commentUpdateError) throw new Error(`Failed to route comment to human review: ${commentUpdateError.message}`);
    }

    // Mark job as completed
    const { error: completionError } = await supabase
      .from('moderation_jobs')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (completionError) throw new Error(`Failed to mark moderation job completed: ${completionError.message}`);

    return { success: true, status: 'completed' };
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error during job processing';
    console.error(`Moderation job ${jobId} failed:`, errorMsg);

    const isMaxAttempts = activeJob.attempts >= (activeJob.max_attempts || 3);
    const { error: retryUpdateError } = await supabase
      .from('moderation_jobs')
      .update({
        status: isMaxAttempts ? 'failed' : 'pending',
        last_error: errorMsg,
        // Exponential backoff for retries: 2^attempts * 60 seconds
        next_run_at: new Date(Date.now() + Math.pow(2, job.attempts || 1) * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (retryUpdateError) {
      console.error(`Failed to persist retry status for moderation job ${jobId}:`, retryUpdateError);
    }

    if (isMaxAttempts) {
      const notificationError = await notifyActiveAdmins(supabase, {
        title: 'Moderation Job Failed Permanently',
        message: `Job for comment ${comment.facebook_comment_id} failed after maximum retry attempts. Error: ${errorMsg}`,
        notification_type: 'job_failure',
        related_comment_id: comment.id,
      });
      if (notificationError) console.error(`Failed to notify admins about failed moderation job ${jobId}: ${notificationError}`);
    }

    return { success: false, status: 'failed', error: errorMsg };
  }
}
