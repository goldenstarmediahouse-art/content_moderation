'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  ShieldAlert,
  Share2,
  Sliders,
  History,
  Bell,
  Users,
  Settings,
  Shield,
} from 'lucide-react';
import { CurrentAdmin } from '@/lib/auth/session';

interface SidebarProps {
  admin: CurrentAdmin;
  pendingCount?: number;
  unreadNotifications?: number;
}

export function Sidebar({ admin, pendingCount = 0, unreadNotifications = 0 }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Overview',
      href: '/',
      icon: LayoutDashboard,
      superAdminOnly: false,
    },
    {
      label: 'Live Comments',
      href: '/comments',
      icon: MessageSquare,
      superAdminOnly: false,
    },
    {
      label: 'Moderation Queue',
      href: '/queue',
      icon: ShieldAlert,
      badge: pendingCount > 0 ? pendingCount : null,
      badgeVariant: 'warning',
      superAdminOnly: false,
    },
    {
      label: 'Facebook Pages',
      href: '/pages',
      icon: Share2,
      superAdminOnly: false,
    },
    {
      label: 'Moderation Rules',
      href: '/rules',
      icon: Sliders,
      superAdminOnly: false,
    },
    {
      label: 'Moderation History',
      href: '/history',
      icon: History,
      superAdminOnly: false,
    },
    {
      label: 'Notifications',
      href: '/notifications',
      icon: Bell,
      badge: unreadNotifications > 0 ? unreadNotifications : null,
      badgeVariant: 'threat',
      superAdminOnly: false,
    },
    {
      label: 'Admin Management',
      href: '/admins',
      icon: Users,
      superAdminOnly: true,
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Settings,
      superAdminOnly: false,
    },
  ];

  const visibleNav = navItems.filter(
    (item) => !item.superAdminOnly || admin.role === 'super_admin'
  );

  return (
    <aside className="w-64 flex-shrink-0 bg-charcoal-900 border-r border-charcoal-800 flex flex-col justify-between h-screen fixed left-0 top-0 select-none z-30">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-5 border-b border-charcoal-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-charcoal-800 border border-charcoal-700 flex items-center justify-center text-charcoal-200">
              <Shield className="w-4 h-4 text-charcoal-200" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-charcoal-100">
                Golden Star Media
              </div>
              <div className="text-[11px] text-charcoal-500 font-medium tracking-tight">
                Church Comment System
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-charcoal-800 text-charcoal-100 border border-charcoal-700'
                    : 'text-charcoal-400 hover:text-charcoal-200 hover:bg-charcoal-850'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-charcoal-200' : 'text-charcoal-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                      item.badgeVariant === 'threat'
                        ? 'bg-status-threat-bg text-red-400 border border-status-threat-border'
                        : 'bg-status-warning-bg text-amber-400 border border-status-warning-border'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Admin Profile & Status at Bottom */}
      <div className="p-4 border-t border-charcoal-800 bg-charcoal-900/50">
        <div className="flex items-center justify-between">
          <div className="truncate">
            <div className="text-xs font-medium text-charcoal-200 truncate">
              {admin.full_name || admin.email}
            </div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-charcoal-500">
              {admin.role === 'super_admin' ? 'Super Administrator' : 'Moderator'}
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-500" title="Active Administrator Session" />
        </div>
      </div>
    </aside>
  );
}
