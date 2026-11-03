import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { PagesView } from '@/components/pages/pages-view';

export const dynamic = 'force-dynamic';

export default async function PagesPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();
  const { data: pages } = await supabase
    .from('facebook_pages')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <AppShell admin={admin} title="Facebook Pages Management">
      <PagesView initialPages={pages || []} admin={admin} />
    </AppShell>
  );
}
