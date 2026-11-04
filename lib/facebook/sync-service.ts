import { fetchPagePosts, fetchPostComments, FacebookCommentItem, FacebookPostItem } from './graph-api';
import { getScopedAdminSupabaseClient } from '@/lib/supabase/client-resolver';

export interface SyncPageCommentsOptions {
  pageDbId: string;
  pageFacebookId: string;
  pageAccessToken: string;
  specificPostId?: string;
  supabaseClient?: any;
}

export interface SyncPageCommentsResult {
  success: boolean;
  pageId: string;
  postsProcessed: number;
  commentsSynced: number;
  commentsUpdated: number;
  errors: string[];
}

/**
 * Synchronizes historical posts and comments from Facebook Graph API to Supabase.
 * - Fetches posts from /{PAGE_ID}/posts
 * - For each post, fetches comments from /{POST_ID}/comments?fields=id,message,created_time,from
 * - Upserts posts into the 'posts' table
 * - Upserts comments into the 'comments' table, preserving existing moderator decisions
 * - Emits safe diagnostic logs without exposing credentials
 */
export async function syncFacebookPageComments(
  options: SyncPageCommentsOptions
): Promise<SyncPageCommentsResult> {
  const { pageDbId, pageFacebookId, pageAccessToken, specificPostId, supabaseClient } = options;
  const supabase = supabaseClient || await getScopedAdminSupabaseClient();

  const result: SyncPageCommentsResult = {
    success: true,
    pageId: pageFacebookId,
    postsProcessed: 0,
    commentsSynced: 0,
    commentsUpdated: 0,
    errors: [],
  };

  console.log(
    `[Facebook Comment Sync] Starting sync for Page: ${pageFacebookId} (DB ID: ${pageDbId})${
      specificPostId ? ` | Specific Post: ${specificPostId}` : ''
    }`
  );

  let targetPosts: FacebookPostItem[] = [];

  if (specificPostId) {
    targetPosts = [{ id: specificPostId, message: 'Target Post' }];
  } else {
    // 1. Fetch recent posts for the Page
    const postsRes = await fetchPagePosts(pageFacebookId, pageAccessToken, 25);
    if (!postsRes.success) {
      result.errors.push(postsRes.error || 'Failed to fetch Page posts from Meta.');
      console.error(
        `[Facebook Comment Sync] Failed to fetch posts for Page: ${pageFacebookId} | Error: ${postsRes.error}`
      );
    } else {
      targetPosts = postsRes.posts;
    }

    // Also check if any posts are already stored locally for this page that might not be in the top 25
    const { data: storedPosts } = await supabase
      .from('posts')
      .select('facebook_post_id, message, permalink_url, created_time')
      .eq('page_id', pageDbId)
      .limit(50);

    if (storedPosts && storedPosts.length > 0) {
      const existingPostIds = new Set(targetPosts.map((p) => p.id));
      for (const sp of storedPosts) {
        if (!existingPostIds.has(sp.facebook_post_id)) {
          targetPosts.push({
            id: sp.facebook_post_id,
            message: sp.message || undefined,
            permalink_url: sp.permalink_url || undefined,
            created_time: sp.created_time || undefined,
          });
        }
      }
    }
  }

  // 2. Process each post and fetch its comments
  for (const post of targetPosts) {
    result.postsProcessed++;

    // Upsert post record into 'posts' table
    let postDbId: string | null = null;
    const { data: postRecord, error: postErr } = await supabase
      .from('posts')
      .upsert(
        {
          page_id: pageDbId,
          facebook_post_id: post.id,
          message: post.message || 'Facebook Post',
          permalink_url: post.permalink_url || null,
          created_time: post.created_time || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'facebook_post_id' }
      )
      .select('id')
      .maybeSingle();

    if (postErr) {
      console.error(
        `[Facebook Comment Sync] Failed to upsert post: ${post.id} | Error: ${postErr.message}`
      );
      result.errors.push(`Post upsert error (${post.id}): ${postErr.message}`);
    } else if (postRecord) {
      postDbId = postRecord.id;
    }

    // 3. Fetch comments for this post calling /{POST_ID}/comments?fields=id,message,created_time,from
    const commentsRes = await fetchPostComments(post.id, pageAccessToken, 100);

    if (!commentsRes.success) {
      result.errors.push(
        `Failed to fetch comments for post ${post.id}: ${commentsRes.error || 'Unknown error'}`
      );
      continue;
    }

    // 4. Upsert each comment into 'comments' table
    for (const comment of commentsRes.comments) {
      try {
        const { data: existingComment } = await supabase
          .from('comments')
          .select('id, moderation_status, is_hidden, external_action_status')
          .eq('facebook_comment_id', comment.id)
          .maybeSingle();

        if (existingComment) {
          // Update comment message and author, but strictly preserve human moderation decisions
          const { error: updateErr } = await supabase
            .from('comments')
            .update({
              message: comment.message,
              commenter_name: comment.from?.name || 'Facebook User',
              commenter_id: comment.from?.id || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingComment.id);

          if (updateErr) {
            result.errors.push(`Comment update error (${comment.id}): ${updateErr.message}`);
          } else {
            result.commentsUpdated++;
          }
        } else {
          // Insert new incoming comment
          const { error: insertErr } = await supabase
            .from('comments')
            .insert({
              page_id: pageDbId,
              post_id: postDbId,
              facebook_comment_id: comment.id,
              facebook_post_id: post.id,
              commenter_id: comment.from?.id || null,
              commenter_name: comment.from?.name || 'Facebook User',
              message: comment.message,
              created_time: comment.created_time,
              moderation_status: 'pending',
              external_action_status: 'none',
              is_hidden: false,
            });

          if (insertErr) {
            result.errors.push(`Comment insert error (${comment.id}): ${insertErr.message}`);
          } else {
            result.commentsSynced++;
          }
        }
      } catch (err: any) {
        result.errors.push(`Error processing comment ${comment.id}: ${err.message}`);
      }
    }
  }

  // 5. Update last_sync_at timestamp on the facebook_pages record
  const now = new Date().toISOString();
  await supabase
    .from('facebook_pages')
    .update({
      last_sync_at: now,
      updated_at: now,
    })
    .eq('id', pageDbId);

  console.log(
    `[Facebook Comment Sync] Complete | Page: ${pageFacebookId} | Posts: ${result.postsProcessed} | Comments New: ${result.commentsSynced} | Comments Updated: ${result.commentsUpdated} | Errors: ${result.errors.length}`
  );

  result.success = result.errors.length === 0 || result.commentsSynced > 0 || result.commentsUpdated > 0;
  return result;
}
