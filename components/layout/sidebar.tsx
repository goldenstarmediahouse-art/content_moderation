'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
  UserCheck,
  User,
  ArrowUpRight,
  BarChart3,
  Clock,
} from 'lucide-react';
import { CurrentAdmin } from '@/lib/auth/session';

interface SidebarProps {
  admin: CurrentAdmin;
  pendingCount?: number;
  unreadNotifications?: number;
  myAssignedCount?: number;
  escalationsCount?: number;
}

export function Sidebar({
  admin,
  pendingCount = 0,
  unreadNotifications = 0,
  myAssignedCount = 0,
  escalationsCount = 0,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams?.get('view');

  const navGroups = [
    {
      title: 'Operations',
      items: [
        {
          label: 'Overview',
          href: '/',
          icon: LayoutDashboard,
          isActive: pathname === '/' && !currentView,
        },
        {
          label: 'All Comments',
          href: '/comments',
          icon: MessageSquare,
          isActive: pathname === '/comments' && (!currentView || currentView === 'all'),
        },
        {
          label: 'My Assigned',
          href: '/comments?view=my_assigned',
          icon: User,
          badge: myAssignedCount > 0 ? myAssignedCount : null,
          badgeVariant: 'info',
          isActive: pathname === '/comments' && currentView === 'my_assigned',
        },
        {
          label: 'Unassigned Queue',
          href: '/comments?view=unassigned',
          icon: UserCheck,
          isActive: pathname === '/comments' && currentView === 'unassigned',
        },
        {
          label: 'Pending Review',
          href: '/queue',
          icon: Clock,
          badge: pendingCount > 0 ? pendingCount : null,
          badgeVariant: 'warning',
          isActive: pathname === '/queue' || (pathname === '/comments' && currentView === 'pending'),
        },
        {
          label: 'Escalations',
          href: '/escalations',
          icon: ArrowUpRight,
          badge: escalationsCount > 0 ? escalationsCount : null,
          badgeVariant: 'threat',
          isActive: pathname === '/escalations' || (pathname === '/comments' && currentView === 'escalations'),
        },
      ],
    },
    {
      title: 'Governance & Audits',
      items: [
        {
          label: 'Moderation History',
          href: '/history',
          icon: History,
          isActive: pathname === '/history',
        },
        {
          label: 'Reports & Workload',
          href: '/reports',
          icon: BarChart3,
          isActive: pathname === '/reports',
        },
        {
          label: 'Moderation Rules',
          href: '/rules',
          icon: Sliders,
          isActive: pathname === '/rules',
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          label: 'Facebook Pages',
          href: '/pages',
          icon: Share2,
          isActive: pathname === '/pages',
        },
        {
          label: 'Notifications',
          href: '/notifications',
          icon: Bell,
          badge: unreadNotifications > 0 ? unreadNotifications : null,
          badgeVariant: 'threat',
          isActive: pathname === '/notifications',
        },
        {
          label: 'Admin Directory',
          href: '/admins',
          icon: Users,
          superAdminOnly: true,
          isActive: pathname === '/admins',
        },
        {
          label: 'System Settings',
          href: '/settings',
          icon: Settings,
          isActive: pathname === '/settings',
        },
      ],
    },
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-charcoal-900 border-r border-charcoal-800 flex flex-col justify-between h-screen fixed left-0 top-0 select-none z-30">
      <div className="overflow-y-auto">
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

        {/* Navigation Sections */}
        <div className="p-3 space-y-4">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item: any) => !item.superAdminOnly || admin.role === 'super_admin'
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <div className="px-3 text-[10px] uppercase font-semibold text-charcoal-500 tracking-wider">
                  {group.title}
                </div>
                {visibleItems.map((item: any) => {
                  const Icon = item.icon;
                  const isActive = item.isActive;

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
                      <div className="flex items-center space-x-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-charcoal-100' : 'text-charcoal-500'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== null && item.badge !== undefined && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                            item.badgeVariant === 'threat'
                              ? 'bg-status-threat-bg text-red-400 border border-status-threat-border'
                              : item.badgeVariant === 'info'
                              ? 'bg-blue-950/80 text-blue-300 border border-blue-800/80'
                              : 'bg-status-warning-bg text-amber-400 border border-status-warning-border'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin Profile & Status at Bottom */}
      <div className="p-4 border-t border-charcoal-800 bg-charcoal-900/50">
        <div className="flex items-center justify-between">
          <div className="truncate pr-2">
            <div className="text-xs font-medium text-charcoal-200 truncate">
              {admin.full_name || admin.email}
            </div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-charcoal-500">
              {admin.role === 'super_admin' ? 'Super Administrator' : 'Moderator'}
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Active Administrator Session" />
        </div>
      </div>
    </aside>
  );
}
