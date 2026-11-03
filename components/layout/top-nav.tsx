'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu, X } from 'lucide-react';
import { CurrentAdmin } from '@/lib/auth/session';

interface TopNavProps {
  title: string;
  admin: CurrentAdmin;
  unreadNotifications?: number;
  mobileMenuOpen: boolean;
  onMobileMenuToggle: () => void;
}

export function TopNav({
  title,
  admin,
  unreadNotifications = 0,
  mobileMenuOpen,
  onMobileMenuToggle,
}: TopNavProps) {
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-charcoal-800 bg-charcoal-900 px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onMobileMenuToggle}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded text-charcoal-300 hover:bg-charcoal-800 md:hidden"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <h1 className="truncate text-sm font-semibold tracking-tight text-charcoal-100 sm:text-base">
          {title}
        </h1>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 sm:gap-4">
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
        <div className="hidden h-4 w-px bg-charcoal-800 sm:block" />

        {/* User Info & Sign Out */}
        <div className="flex items-center gap-2 text-xs sm:gap-3">
          <span className="text-charcoal-400 hidden sm:inline">
            {admin.email}
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-charcoal-850 hover:bg-charcoal-800 text-charcoal-300 hover:text-charcoal-100 border border-charcoal-700 transition-colors"
            title="Sign out of administration system"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
