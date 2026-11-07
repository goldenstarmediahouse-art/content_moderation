import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { LiveCommentsView } from '@/components/comments/live-comments-view';
import { CommentWithDetails } from '@/types/database';
import { enrichCommentsWithDetails } from '@/lib/comments/enrich-comments';

export const dynamic = 'force-dynamic';

export default async function EscalationsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();

  // Fetch escalated comments
  const { data: rawComments, count } = await supabase
    .from('comments')
    .select('*', { count: 'exact' })
    .eq('moderation_status', 'escalated')
    .order('comment_created_at', { ascending: false });

  const { data: pages } = await supabase
    .from('facebook_pages')
    .select('*')
    .order('name');

  const { data: moderators } = await supabase
    .from('admin_users')
    .select('*')
    .eq('is_active', true)
    .order('role', { ascending: false });

  const comments: CommentWithDetails[] = await enrichCommentsWithDetails(supabase, rawComments || []);

  return (
    <AppShell admin={admin} title="Escalations Queue (Super Admin Oversight)">
      <LiveCommentsView
        initialComments={comments}
        pages={pages || []}
        moderators={moderators || []}
        currentAdmin={admin}
        totalCount={count || comments.length}
        initialTab="escalations"
      />
    </AppShell>
  );
}
