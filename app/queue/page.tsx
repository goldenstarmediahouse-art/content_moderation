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
    .select('*, page:facebook_pages(*), post:posts(*), moderation_result:moderation_results(*), actions:moderation_actions(*)')
    .eq('moderation_status', 'review_required')
    .order('created_time', { ascending: false });

  const comments = (rawComments || []) as CommentWithDetails[];

  return (
    <AppShell admin={admin} title="Moderation Decision Queue">
      <QueueView initialComments={comments} />
    </AppShell>
  );
}
