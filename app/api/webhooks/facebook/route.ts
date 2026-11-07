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
    const { data: pageRecord } = await supabase
      .from('facebook_pages')
      .select('id, is_monitored, name')
      .eq('page_id', pageFacebookId)
      .single();

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
      const messageText = val.message || '';
      const commenterId = val.from?.id || val.sender_id || null;
      const commenterName = val.from?.name || val.sender_name || 'Facebook User';
      const createdUnixTime = val.created_time
        ? new Date(typeof val.created_time === 'number' ? val.created_time * 1000 : val.created_time)
        : new Date();

      const sourceEventId = `fb_${commentFacebookId}_${val.verb}_${val.created_time || Date.now()}`;

      // Ensure post record exists if post ID is present
      let postId: string | null = null;
      if (postFacebookId) {
        const { data: postRecord } = await supabase
          .from('posts')
          .select('id')
          .eq('facebook_post_id', postFacebookId)
          .maybeSingle();

        if (postRecord) {
          postId = postRecord.id;
        } else {
          const { data: newPost } = await supabase
            .from('posts')
            .insert({
              page_id: pageRecord.id,
              facebook_post_id: postFacebookId,
              message: 'Facebook Post',
              published_at: createdUnixTime.toISOString(),
            })
            .select('id')
            .single();

          if (newPost) postId = newPost.id;
        }
      }

      // Check for duplicate comment ingestion
      const { data: existingComment } = await supabase
        .from('comments')
        .select('id, moderation_status')
        .eq('facebook_comment_id', commentFacebookId)
        .maybeSingle();

      let commentId: string;

      if (existingComment) {
        commentId = existingComment.id;
        // Update existing comment message if edited
        await supabase
          .from('comments')
          .update({
            message: messageText,
            updated_at: new Date().toISOString(),
          })
          .eq('id', commentId);
      } else {
        const { data: insertedComment, error: insertError } = await supabase
          .from('comments')
          .insert({
            page_id: pageRecord.id,
            post_id: postId,
            facebook_comment_id: commentFacebookId,
            facebook_post_id: postFacebookId,
            parent_comment_id: val.parent_id || null,
            source_event_id: sourceEventId,
            commenter_id: commenterId,
            commenter_name: commenterName,
            message: messageText,
            created_time: createdUnixTime.toISOString(),
            moderation_status: 'pending',
          })
          .select('id')
          .single();

        if (insertError || !insertedComment) {
          console.error('Failed to insert incoming comment:', insertError);
          continue;
        }

        commentId = insertedComment.id;
      }

      // Queue moderation job for AI analysis
      const { data: jobRecord } = await supabase
        .from('moderation_jobs')
        .insert({
          comment_id: commentId,
          status: 'pending',
        })
        .select('id')
        .single();

      if (jobRecord) {
        // Kick off processing in the background without awaiting to keep webhook response fast
        processModerationJob(jobRecord.id).catch((err) => {
          console.error(`Background job execution error for job ${jobRecord.id}:`, err);
        });
      }
    }
  }

  return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
}
