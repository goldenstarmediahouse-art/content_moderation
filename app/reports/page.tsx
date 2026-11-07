import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { ReportsView } from '@/components/reports/reports-view';
import { enrichCommentsWithDetails } from '@/lib/comments/enrich-comments';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();

  // Fetch comments
  const { data: commentRows } = await supabase
    .from('comments')
    .select('*')
    .order('comment_created_at', { ascending: false });
  const comments = await enrichCommentsWithDetails(supabase, commentRows || []);

  // Fetch actions
  const { data: actions } = await supabase
    .from('moderation_actions')
    .select('*')
    .order('created_at', { ascending: false });

  // Fetch active moderators
  const { data: moderators } = await supabase
    .from('admin_users')
    .select('*')
    .eq('is_active', true)
    .order('role', { ascending: false });

  return (
    <AppShell admin={admin} title="Moderation Reports & Analytics">
      <ReportsView
        comments={comments || []}
        actions={(actions as any) || []}
        moderators={moderators || []}
      />
    </AppShell>
  );
}
