import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { LiveCommentsView, CommentViewTab } from '@/components/comments/live-comments-view';
import { enrichCommentsWithDetails } from '@/lib/comments/enrich-comments';

export const dynamic = 'force-dynamic';

interface CommentsPageProps {
  searchParams?: {
    view?: string;
  };
}

export default async function CommentsPage({ searchParams }: CommentsPageProps) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();

  const { data: rawComments, count } = await supabase
    .from('comments')
    .select('*', { count: 'exact' })
    .order('comment_created_at', { ascending: false })
    .limit(200);

  // Fetch active pages for filter dropdown
  const { data: pages } = await supabase
    .from('facebook_pages')
    .select('*')
    .order('name');

  // Fetch active administrators/moderators for assignment controls
  const { data: moderators } = await supabase
    .from('admin_users')
    .select('*')
    .eq('is_active', true)
    .order('role', { ascending: false });

  const comments = await enrichCommentsWithDetails(supabase, rawComments || []);
  const initialTab = (searchParams?.view as CommentViewTab) || 'all';

  return (
    <AppShell admin={admin} title="Comment Management & Moderation Queue">
      <LiveCommentsView
        initialComments={comments}
        pages={pages || []}
        moderators={moderators || []}
        currentAdmin={admin}
        totalCount={count || comments.length}
        initialTab={initialTab}
      />
    </AppShell>
  );
}
