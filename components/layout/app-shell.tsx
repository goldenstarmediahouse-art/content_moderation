import React from 'react';
import { Sidebar } from './sidebar';
import { TopNav } from './top-nav';
import { CurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface AppShellProps {
  admin: CurrentAdmin;
  title: string;
  children: React.ReactNode;
}

export async function AppShell({ admin, title, children }: AppShellProps) {
  let pendingCount = 0;
  let unreadNotifications = 0;
  let myAssignedCount = 0;
  let escalationsCount = 0;

  try {
    const supabase = await createServerSupabaseClient();

    // 1. Pending reviews count
    const { count: pendingQueueCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .in('moderation_status', ['pending', 'review_required']);

    pendingCount = pendingQueueCount || 0;

    // 2. Unread notifications for this admin
    const { count: notifCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .or(`admin_id.eq.${admin.id},admin_id.is.null`);

    unreadNotifications = notifCount || 0;

    // 3. My Assigned comments count
    const { count: assignedCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', admin.id)
      .in('moderation_status', ['pending', 'review_required', 'escalated']);

    myAssignedCount = assignedCount || 0;

    // 4. Escalations count
    const { count: escCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .or('is_escalated.eq.true,moderation_status.eq.escalated');

    escalationsCount = escCount || 0;
  } catch (err) {
    // Database access fallback if table or columns are not yet provisioned
  }

  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-200 flex">
      {/* Persistent Left Sidebar with dynamic badge counters */}
      <Sidebar
        admin={admin}
        pendingCount={pendingCount}
        unreadNotifications={unreadNotifications}
        myAssignedCount={myAssignedCount}
        escalationsCount={escalationsCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <TopNav
          title={title}
          admin={admin}
          unreadNotifications={unreadNotifications}
        />
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
