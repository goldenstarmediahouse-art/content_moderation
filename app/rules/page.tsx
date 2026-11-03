import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { RulesView } from '@/components/rules/rules-view';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();
  const { data: rules } = await supabase
    .from('moderation_rules')
    .select('*')
    .order('created_at', { ascending: true });

  return (
    <AppShell admin={admin} title="Moderation Rules & Policies">
      <RulesView initialRules={rules || []} admin={admin} />
    </AppShell>
  );
}
