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

  try {
    const supabase = await createServerSupabaseClient();

    // Query real pending review count
    const { count: pendingQueueCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('moderation_status', 'review_required');

    pendingCount = pendingQueueCount || 0;

    // Query real unread notifications count
    const { count: notifCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    unreadNotifications = notifCount || 0;
  } catch (err) {
    // Database access fallback if not yet connected
  }

  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-200 flex">
      {/* Persistent Left Sidebar */}
      <Sidebar
        admin={admin}
        pendingCount={pendingCount}
        unreadNotifications={unreadNotifications}
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
