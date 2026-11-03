import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { NotificationsView } from '@/components/notifications/notifications-view';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <AppShell admin={admin} title="Incident & System Notifications">
      <NotificationsView initialNotifications={notifications || []} />
    </AppShell>
  );
}
