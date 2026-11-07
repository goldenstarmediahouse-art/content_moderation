import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { HistoryView } from '@/components/history/history-view';
import { getModerationActionPresentation } from '@/lib/comments/comment-state';
import { ActorType, Database } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();
  const { data: actions, error: actionsError } = await supabase
    .from('moderation_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150);
  if (actionsError) throw new Error(`Failed to load moderation history: ${actionsError.message}`);

  const actionRows = (actions || []) as Database['public']['Tables']['moderation_actions']['Row'][];
  const commentIds = Array.from(new Set(actionRows.map((action) => action.comment_id)));
  const { data: comments, error: commentsError } = commentIds.length > 0
    ? await supabase.from('comments').select('id, message, commenter_name, post_id').in('id', commentIds)
    : { data: [], error: null };
  if (commentsError) throw new Error(`Failed to load moderation history comments: ${commentsError.message}`);
  const commentRows = (comments || []) as Pick<Database['public']['Tables']['comments']['Row'], 'id' | 'message' | 'commenter_name' | 'post_id'>[];
  const postIds = Array.from(new Set(commentRows.flatMap((comment) => comment.post_id ? [comment.post_id] : [])));
  const { data: posts, error: postsError } = postIds.length > 0
    ? await supabase.from('posts').select('id, page_id').in('id', postIds)
    : { data: [], error: null };
  if (postsError) throw new Error(`Failed to load moderation history posts: ${postsError.message}`);
  const postRows = (posts || []) as Pick<Database['public']['Tables']['posts']['Row'], 'id' | 'page_id'>[];
  const pageIds = Array.from(new Set(postRows.map((post) => post.page_id)));
  const { data: pages, error: pagesError } = pageIds.length > 0
    ? await supabase.from('facebook_pages').select('id, name').in('id', pageIds)
    : { data: [], error: null };
  if (pagesError) throw new Error(`Failed to load moderation history Pages: ${pagesError.message}`);
  const pageRows = (pages || []) as Pick<Database['public']['Tables']['facebook_pages']['Row'], 'id' | 'name'>[];
  const postById = new Map(postRows.map((post) => [post.id, post]));
  const pageById = new Map(pageRows.map((page) => [page.id, page]));
  const commentById = new Map(commentRows.map((comment) => {
    const post = comment.post_id ? postById.get(comment.post_id) : null;
    return [comment.id, {
      message: comment.message,
      commenter_name: comment.commenter_name,
      facebook_pages: post ? pageById.get(post.page_id) || null : null,
    }];
  }));
  const performerIds = Array.from(new Set(actionRows.flatMap((action) => action.performed_by ? [action.performed_by] : [])));
  const { data: performers, error: performersError } = performerIds.length > 0
    ? await supabase.from('admin_users').select('id, role').in('id', performerIds)
    : { data: [], error: null };
  if (performersError) throw new Error(`Failed to load moderation action performers: ${performersError.message}`);
  const performerRows = (performers || []) as Pick<Database['public']['Tables']['admin_users']['Row'], 'id' | 'role'>[];
  const performerById = new Map(performerRows.map((performer) => [performer.id, performer]));
  const initialActions = actionRows.map((action) => {
    const actorType: ActorType = action.performed_by
      ? performerById.get(action.performed_by)?.role || 'moderator'
      : /auto-|by ai|detected by ai/i.test(action.reason || '')
        ? 'ai'
        : 'system';
    return {
      ...action,
      ...getModerationActionPresentation(action),
      actor_type: actorType,
      comments: commentById.get(action.comment_id) || null,
    };
  }) as (Database['public']['Tables']['moderation_actions']['Row'] & {
    action: Database['public']['Tables']['moderation_actions']['Row']['action_type'];
    actor_id: string | null;
    actor_type: ActorType;
    outcome: 'success' | 'failed' | 'pending';
    api_response: Database['public']['Tables']['moderation_actions']['Row']['facebook_response'];
    comments: {
      message: string;
      commenter_name: string | null;
      facebook_pages: { name: string } | null;
    } | null;
  })[];

  return (
    <AppShell admin={admin} title="Audit Trail & Moderation History">
      <HistoryView initialActions={initialActions} />
    </AppShell>
  );
}
