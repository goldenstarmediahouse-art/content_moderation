'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut } from 'lucide-react';
import { CurrentAdmin } from '@/lib/auth/session';

interface TopNavProps {
  title: string;
  admin: CurrentAdmin;
  unreadNotifications?: number;
}

export function TopNav({ title, admin, unreadNotifications = 0 }: TopNavProps) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }

  return (
    <header className="h-16 bg-charcoal-900 border-b border-charcoal-800 px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center space-x-3">
        <h1 className="text-base font-semibold text-charcoal-100 tracking-tight">
          {title}
        </h1>
      </div>

      <div className="flex items-center space-x-4">
        {/* Notification bell */}
        <Link
          href="/notifications"
          className="relative p-2 rounded text-charcoal-400 hover:text-charcoal-200 hover:bg-charcoal-800 transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifications > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-status-threat" />
          )}
        </Link>

        {/* Divider */}
        <div className="h-4 w-px bg-charcoal-800" />

        {/* User Info & Sign Out */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-charcoal-400 hidden sm:inline">
            {admin.email}
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-charcoal-850 hover:bg-charcoal-800 text-charcoal-300 hover:text-charcoal-100 border border-charcoal-700 transition-colors"
            title="Sign out of administration system"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
