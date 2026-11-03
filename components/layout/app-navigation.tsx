'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { TopNav } from './top-nav';
import { CurrentAdmin } from '@/lib/auth/session';

interface AppNavigationProps {
  admin: CurrentAdmin;
  title: string;
  pendingCount: number;
  unreadNotifications: number;
  myAssignedCount: number;
  escalationsCount: number;
  children: React.ReactNode;
}

export function AppNavigation({
  admin,
  title,
  pendingCount,
  unreadNotifications,
  myAssignedCount,
  escalationsCount,
  children,
}: AppNavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    }

    function closeOnDesktopResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnDesktopResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnDesktopResize);
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <Sidebar
        admin={admin}
        pendingCount={pendingCount}
        unreadNotifications={unreadNotifications}
        myAssignedCount={myAssignedCount}
        escalationsCount={escalationsCount}
        mobileOpen={mobileMenuOpen}
        onNavigate={() => setMobileMenuOpen(false)}
      />
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <div className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col md:ml-64">
        <TopNav
          title={title}
          admin={admin}
          unreadNotifications={unreadNotifications}
          mobileMenuOpen={mobileMenuOpen}
          onMobileMenuToggle={() => setMobileMenuOpen((open) => !open)}
        />
        {children}
      </div>
    </>
  );
}
