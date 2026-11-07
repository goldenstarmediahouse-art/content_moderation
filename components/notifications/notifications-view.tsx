'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { Database } from '@/types/database';
import { Badge } from '@/components/ui/badge';

function getNotificationVariant(type: string): 'threat' | 'warning' | 'info' {
  if (['threat', 'escalation', 'job_failure', 'integration_error'].includes(type)) {
    return 'threat';
  }
  if (['review_required', 'assignment', 'reassignment'].includes(type)) {
    return 'warning';
  }
  return 'info';
}

interface NotificationsViewProps {
  initialNotifications: Database['public']['Tables']['notifications']['Row'][];
}

export function NotificationsView({ initialNotifications }: NotificationsViewProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [loading, setLoading] = useState(false);

  async function handleMarkRead(id: string) {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId: id }),
      });

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      router.refresh();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }

  async function handleMarkAllRead() {
    setLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      router.refresh();
    } catch (err) {
      console.error('Error marking all as read:', err);
    } finally {
      setLoading(false);
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
            System & Moderation Notifications ({unreadCount} unread)
          </h2>
          <p className="text-xs text-charcoal-400 mt-0.5">
            Real incident alerts, threat escalations, and background job notifications.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 border border-charcoal-700 text-xs font-medium disabled:opacity-50"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-12 text-center text-xs text-charcoal-500 space-y-2">
          <Bell className="w-8 h-8 text-charcoal-600 mx-auto" />
          <h3 className="text-sm font-semibold text-charcoal-200">No Notifications</h3>
          <p>There are no active threat or operational system alerts recorded.</p>
        </div>
      ) : (
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg divide-y divide-charcoal-800 overflow-hidden">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                notif.is_read ? 'bg-charcoal-900' : 'bg-charcoal-850/40'
              }`}
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center space-x-2 text-xs">
                  <span
                    className={`font-semibold uppercase tracking-wide ${
                      getNotificationVariant(notif.notification_type) === 'threat' ? 'text-red-400' : 'text-charcoal-200'
                    }`}
                  >
                    {notif.title}
                  </span>
                  <span className="text-charcoal-600">•</span>
                  <Badge variant={getNotificationVariant(notif.notification_type)}>
                    {notif.notification_type.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <p className="text-xs text-charcoal-300 leading-relaxed">{notif.message}</p>

                {notif.related_comment_id && (
                  <div className="pt-1">
                    <Link
                      href="/queue"
                      className="inline-flex items-center space-x-1 text-[11px] text-amber-400 hover:text-amber-300 underline font-medium"
                    >
                      <span>Jump to Review Queue</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>

              {!notif.is_read && (
                <button
                  onClick={() => handleMarkRead(notif.id)}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-charcoal-800 text-charcoal-400 hover:text-charcoal-200 text-xs"
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
