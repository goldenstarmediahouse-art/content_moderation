import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { AdminsView } from '@/components/admins/admins-view';

export const dynamic = 'force-dynamic';

export default async function AdminsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  // Super Admin security enforcement
  if (admin.role !== 'super_admin') {
    redirect('/');
  }

  const supabase = await createServerSupabaseClient();
  const { data: admins } = await supabase
    .from('admin_users')
    .select('*')
    .order('role', { ascending: false });

  return (
    <AppShell admin={admin} title="Administrator Account Management">
      <AdminsView initialAdmins={admins || []} currentAdmin={admin} />
    </AppShell>
  );
}
