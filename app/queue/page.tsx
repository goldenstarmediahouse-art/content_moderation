import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { QueueView } from '@/components/queue/queue-view';
import { CommentWithDetails } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();

  // Fetch comments requiring review
  const { data: rawComments } = await supabase
    .from('comments')
    .select(
      '*, page:facebook_pages(*), post:posts(*), assigned_admin:admin_users!comments_assigned_to_fkey(*), moderation_result:moderation_results(*), actions:moderation_actions(*)'
    )
    .in('moderation_status', ['review_required', 'pending'])
    .order('created_time', { ascending: false });

  const { data: moderators } = await supabase
    .from('admin_users')
    .select('*')
    .eq('is_active', true)
    .order('role', { ascending: false });

  const comments = (rawComments || []) as CommentWithDetails[];

  return (
    <AppShell admin={admin} title="Moderation Decision Queue">
      <QueueView
        initialComments={comments}
        currentAdmin={admin}
        moderators={moderators || []}
      />
    </AppShell>
  );
}
