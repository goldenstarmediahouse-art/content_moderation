import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { HistoryView } from '@/components/history/history-view';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();
  const { data: actions } = await supabase
    .from('moderation_actions')
    .select('*, comments(message, commenter_name, facebook_pages(name))')
    .order('created_at', { ascending: false })
    .limit(150);

  return (
    <AppShell admin={admin} title="Audit Trail & Moderation History">
      <HistoryView initialActions={(actions || []) as any} />
    </AppShell>
  );
}
