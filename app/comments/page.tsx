import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { LiveCommentsView } from '@/components/comments/live-comments-view';
import { CommentWithDetails } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function CommentsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();

  // Fetch comments with page, post, moderation_result, and moderation_actions
  const { data: rawComments, count } = await supabase
    .from('comments')
    .select('*, page:facebook_pages(*), post:posts(*), moderation_result:moderation_results(*), actions:moderation_actions(*)', { count: 'exact' })
    .order('created_time', { ascending: false })
    .limit(100);

  // Fetch active pages for filter dropdown
  const { data: pages } = await supabase
    .from('facebook_pages')
    .select('*')
    .order('name');

  const comments = (rawComments || []) as CommentWithDetails[];

  return (
    <AppShell admin={admin} title="Live Comments Stream">
      <LiveCommentsView
        initialComments={comments}
        pages={pages || []}
        totalCount={count || comments.length}
      />
    </AppShell>
  );
}
