import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { AppShell } from '@/components/layout/app-shell';
import { SettingsView } from '@/components/settings/settings-view';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const metaSecret = process.env.META_APP_SECRET;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const envStatus = {
    supabaseConfigured: Boolean(supabaseUrl && anonKey && !supabaseUrl.includes('placeholder')),
    serviceRoleConfigured: Boolean(serviceKey && !serviceKey.includes('placeholder')),
    metaConfigured: Boolean(metaSecret),
    encryptionConfigured: Boolean(encryptionKey && encryptionKey.length >= 32),
    openaiConfigured: Boolean(openaiKey),
    appUrl,
    webhookVerifyTokenConfigured: Boolean(process.env.META_VERIFY_TOKEN),
  };

  return (
    <AppShell admin={admin} title="System Settings & Integration Status">
      <SettingsView admin={admin} envStatus={envStatus} />
    </AppShell>
  );
}
