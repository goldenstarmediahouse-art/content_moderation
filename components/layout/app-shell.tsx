import React from 'react';
import { AppNavigation } from './app-navigation';
import { CurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAssignedCommentIds, resolveCommentAssignments } from '@/lib/comments/comment-state';

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
      .eq('admin_id', admin.id);

    unreadNotifications = notifCount || 0;

    // 3. My Assigned comments count from the moderation action history
    const [
      { data: assignmentActions, error: assignmentActionsError },
      { data: assignmentAudits, error: assignmentAuditsError },
    ] = await Promise.all([
      supabase
        .from('moderation_actions')
        .select('comment_id, action_type, performed_by, facebook_response, action_status, reason, created_at')
        .in('action_type', ['assigned', 'reassigned', 'claimed', 'released'])
        .order('created_at', { ascending: false }),
      supabase
        .from('audit_logs')
        .select('entity_id, event_type, metadata, created_at, admin_id')
        .eq('entity_type', 'comment')
        .in('event_type', ['COMMENT_ASSIGNED', 'COMMENT_REASSIGNED', 'COMMENT_CLAIMED', 'COMMENT_RELEASED'])
        .order('created_at', { ascending: false }),
    ]);
    if (assignmentActionsError) throw assignmentActionsError;
    if (assignmentAuditsError) throw assignmentAuditsError;

    const assignmentByComment = resolveCommentAssignments(
      assignmentActions || [],
      assignmentAudits || []
    );
    const assignedComments = getAssignedCommentIds(assignmentByComment, admin.id);

    if (assignedComments.length > 0) {
      const { count: assignedCount } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .in('id', assignedComments)
        .in('moderation_status', ['pending', 'review_required', 'escalated']);
      myAssignedCount = assignedCount || 0;
    }

    // 4. Escalations count
    const { count: escCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('moderation_status', 'escalated');

    escalationsCount = escCount || 0;
  } catch (err) {
    console.error('Failed to load dashboard moderation counts:', err);
  }

  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-200 flex">
      <AppNavigation
        admin={admin}
        title={title}
        pendingCount={pendingCount}
        unreadNotifications={unreadNotifications}
        myAssignedCount={myAssignedCount}
        escalationsCount={escalationsCount}
      >
        <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 p-4 sm:p-6">
          {children}
        </main>
      </AppNavigation>
    </div>
  );
}
