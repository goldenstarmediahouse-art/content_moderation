import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { LiveCommentsView } from '@/components/comments/live-comments-view';
import { CommentWithDetails } from '@/types/database';

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
    .select(
      '*, page:facebook_pages(*), post:posts(*), assigned_admin:admin_users!comments_assigned_to_fkey(*), moderation_result:moderation_results(*), actions:moderation_actions(*)',
      { count: 'exact' }
    )
    .or('is_escalated.eq.true,moderation_status.eq.escalated')
    .order('created_time', { ascending: false });

  const { data: pages } = await supabase
    .from('facebook_pages')
    .select('*')
    .order('name');

  const { data: moderators } = await supabase
    .from('admin_users')
    .select('*')
    .eq('is_active', true)
    .order('role', { ascending: false });

  const comments = (rawComments || []) as CommentWithDetails[];

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
