import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/facebook/graph-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { processModerationJob } from '@/lib/moderation/job-runner';

/**
 * GET Handler for Meta Webhook Challenge Verification
 * Meta checks hub.mode, hub.verify_token, and expects hub.challenge returned as plain text.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('META_VERIFY_TOKEN is not configured.');
    return new NextResponse('Webhook verify token unconfigured on server', { status: 500 });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden: Invalid verification token', { status: 403 });
}

/**
 * POST Handler for Meta Feed Webhook Ingestion
 * Verifies HMAC-SHA256 signature, deduplicates comments, stores them,
 * and schedules moderation jobs.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256');
  const rawBody = await request.text();

  // 1. Verify Meta Signature
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    console.warn('Rejected Facebook webhook: Invalid or missing HMAC-SHA256 signature.');
    return new NextResponse('Unauthorized: Invalid webhook signature', { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    return new NextResponse('Bad Request: Invalid JSON', { status: 400 });
  }

  if (body.object !== 'page' || !Array.isArray(body.entry)) {
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }

  const supabase = createAdminClient();

  for (const entry of body.entry) {
    const pageFacebookId = entry.id;
    if (!pageFacebookId || !Array.isArray(entry.changes)) continue;

    // Check if the page is connected and monitored
    const { data: pageRecord, error: pageError } = await supabase
      .from('facebook_pages')
      .select('id, is_monitored, name')
      .eq('page_id', pageFacebookId)
      .single();

    if (pageError && pageError.code !== 'PGRST116') {
      console.error(`Failed to load Facebook Page ${pageFacebookId} for webhook:`, pageError);
      return NextResponse.json({ error: 'Failed to load connected Facebook Page.' }, { status: 500 });
    }

    if (!pageRecord || !pageRecord.is_monitored) {
      // Unmonitored or unknown page
      continue;
    }

    for (const change of entry.changes) {
      if (change.field !== 'feed' || !change.value) continue;

      const val = change.value;
      const isComment = val.item === 'comment';
      if (!isComment || (val.verb !== 'add' && val.verb !== 'edit')) {
        continue;
      }

      const commentFacebookId = val.comment_id;
      const postFacebookId = val.post_id;
      if (!commentFacebookId) {
        console.error('Rejected Facebook comment webhook without a comment ID.');
        return NextResponse.json({ error: 'Facebook comment ID is required.' }, { status: 400 });
      }
      const messageText = val.message || '';
      const commenterId = val.from?.id || val.sender_id || null;
      const commenterName = val.from?.name || val.sender_name || 'Facebook User';
      const createdUnixTime = val.created_time
        ? new Date(typeof val.created_time === 'number' ? val.created_time * 1000 : val.created_time)
        : new Date();
      if (!Number.isFinite(createdUnixTime.getTime())) {
        console.error(`Rejected malformed creation time for Facebook comment ${commentFacebookId}.`);
        return NextResponse.json({ error: 'Facebook comment has an invalid created_time.' }, { status: 400 });
      }

      const sourceEventId = `fb_${commentFacebookId}_${val.verb}_${val.created_time || Date.now()}`;

      // Ensure post record exists if post ID is present
      let postId: string | null = null;
      if (postFacebookId) {
        const { data: postRecord, error: postLookupError } = await supabase
          .from('posts')
          .select('id')
          .eq('facebook_post_id', postFacebookId)
          .maybeSingle();

        if (postLookupError) {
          console.error(`Failed to load Facebook post ${postFacebookId} for webhook:`, postLookupError);
          return NextResponse.json({ error: 'Failed to load Facebook post record.' }, { status: 500 });
        }

        if (postRecord) {
          postId = postRecord.id;
        } else {
          const { data: newPost, error: postInsertError } = await supabase
            .from('posts')
            .insert({
              page_id: pageRecord.id,
              facebook_post_id: postFacebookId,
              message: 'Facebook Post',
              published_at: null,
            })
            .select('id')
            .single();

          if (postInsertError) {
            console.error(`Failed to insert Facebook post ${postFacebookId} for webhook:`, postInsertError);
            return NextResponse.json({ error: 'Failed to save Facebook post record.' }, { status: 500 });
          }
          if (newPost) postId = newPost.id;
        }
      }

      // Check for duplicate comment ingestion
      const { data: existingComment, error: commentLookupError } = await supabase
        .from('comments')
        .select('id, message, moderation_status')
        .eq('facebook_comment_id', commentFacebookId)
        .maybeSingle();
      if (commentLookupError) {
        console.error(`Failed to load Facebook comment ${commentFacebookId} for webhook:`, commentLookupError);
        return NextResponse.json({ error: 'Failed to load existing Facebook comment.' }, { status: 500 });
      }

      let commentId: string;
      const shouldQueueModeration = !existingComment ||
        existingComment.moderation_status === 'pending' ||
        (val.verb === 'edit' && existingComment.message !== messageText);

      if (existingComment) {
        commentId = existingComment.id;
        // Update existing comment message if edited
        const { error: commentUpdateError } = await supabase
          .from('comments')
          .update({
            message: messageText,
            commenter_facebook_id: commenterId,
            commenter_name: commenterName,
            comment_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', commentId);
        if (commentUpdateError) {
          console.error(`Failed to update Facebook comment ${commentFacebookId}:`, commentUpdateError);
          return NextResponse.json({ error: 'Failed to update Facebook comment.' }, { status: 500 });
        }
      } else {
        if (!postId) {
          console.error(`Facebook comment ${commentFacebookId} has no associated post record.`);
          return NextResponse.json({ error: 'Facebook comment is missing its associated post.' }, { status: 400 });
        }

        const { data: insertedComment, error: insertError } = await supabase
          .from('comments')
          .insert({
            post_id: postId,
            facebook_comment_id: commentFacebookId,
            parent_facebook_comment_id: val.parent_id || null,
            source_event_id: sourceEventId,
            commenter_facebook_id: commenterId,
            commenter_name: commenterName,
            message: messageText,
            comment_created_at: createdUnixTime.toISOString(),
            is_hidden: false,
            is_deleted: false,
            moderation_status: 'pending',
          })
          .select('id')
          .single();

        if (insertError || !insertedComment) {
          console.error('Failed to insert incoming comment:', insertError);
          return NextResponse.json({ error: 'Failed to insert incoming Facebook comment.' }, { status: 500 });
        }

        commentId = insertedComment.id;
      }

      // Queue moderation job for AI analysis
      if (shouldQueueModeration) {
        const { data: activeJob, error: activeJobError } = await supabase
          .from('moderation_jobs')
          .select('id')
          .eq('comment_id', commentId)
          .in('status', ['pending', 'processing'])
          .limit(1)
          .maybeSingle();

        if (activeJobError) {
          console.error(`Failed to check active moderation jobs for comment ${commentId}:`, activeJobError);
          return NextResponse.json({ error: 'Failed to check moderation job status.' }, { status: 500 });
        }

        if (!activeJob) {
          const { data: jobRecord, error: jobError } = await supabase
            .from('moderation_jobs')
            .insert({
              comment_id: commentId,
              status: 'pending',
            })
            .select('id')
            .single();

          if (jobError || !jobRecord) {
            console.error(`Failed to queue moderation job for comment ${commentId}:`, jobError);
            return NextResponse.json({ error: 'Failed to queue moderation job.' }, { status: 500 });
          }

          processModerationJob(jobRecord.id).catch((err) => {
            console.error(`Background job execution error for job ${jobRecord.id}:`, err);
          });
        }
      }
    }
  }

  return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
}
