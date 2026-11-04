import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken } from '@/lib/crypto/token-encryption';
import { inspectPageToken, subscribePageToWebhooks } from '@/lib/facebook/graph-api';
import { Database } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSuperAdmin();
    const body = await request.json();
    const { action } = body;
    const supabase = createAdminClient();

    if (action === 'connect') {
      const { pageId, name, accessToken, category } = body;
      if (!pageId || !name || !accessToken) {
        return NextResponse.json({ error: 'pageId, name, and accessToken are required.' }, { status: 400 });
      }

      // Test token validity with Meta
      const tokenTest = await inspectPageToken(accessToken);
      const connectionStatus = tokenTest.valid ? 'connected' : 'connection_error';
      const errorMessage = tokenTest.error || null;
      const now = new Date().toISOString();

      // Encrypt the token with AES-256-GCM before saving
      const encryptedToken = encryptToken(accessToken);

      // Upsert page record
      const { data: pageRecord, error: pageErr } = await supabase
        .from('facebook_pages')
        .upsert({
          page_name: name,
          facebook_page_id: pageId,
          page_id: pageId,
          name,
          category: category || 'Church / Religious Organization',
          is_active: true,
          monitoring_enabled: true,
          is_monitored: true,
          auto_hide_enabled: false,
          auto_approve_safe: false,
          connection_status: connectionStatus,
          error_message: errorMessage,
          ...(tokenTest.valid ? { connected_at: now } : {}),
          last_sync_at: now,
          updated_at: now,
        }, { onConflict: 'page_id' })
        .select()
        .single();

      if (pageErr || !pageRecord) {
        return NextResponse.json({ error: pageErr?.message || 'Failed to save page' }, { status: 500 });
      }

      // Upsert encrypted token in page_tokens table
      const { error: tokenErr } = await supabase
        .from('page_tokens')
        .upsert({
          page_id: pageRecord.id,
          encrypted_access_token: encryptedToken,
          token_type: 'page_access_token',
        }, { onConflict: 'page_id' });

      if (tokenErr) {
        return NextResponse.json({ error: `Page saved but token encryption storage failed: ${tokenErr.message}` }, { status: 500 });
      }

      // Attempt to subscribe page to webhooks if token is valid
      let webhookSubscribed = false;
      if (tokenTest.valid) {
        const subRes = await subscribePageToWebhooks(pageId, accessToken);
        webhookSubscribed = subRes.success;
        if (subRes.success) {
          await supabase.from('facebook_pages').update({ webhook_subscribed: true }).eq('id', pageRecord.id);
        }
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        admin_id: admin.id,
        action: 'CONNECT_FACEBOOK_PAGE',
        entity_type: 'facebook_pages',
        entity_id: pageRecord.id,
        details: { pageId, name, webhookSubscribed },
      });

      return NextResponse.json({
        success: true,
        page: pageRecord,
        webhookSubscribed,
        tokenValid: tokenTest.valid,
        permissions: tokenTest.permissions,
      });
    }

    if (action === 'toggle_setting') {
      const { pageDbId, setting, value } = body;
      if (!pageDbId || !setting) {
        return NextResponse.json({ error: 'Missing pageDbId or setting' }, { status: 400 });
      }

      const updateData: Database['public']['Tables']['facebook_pages']['Update'] = {
        updated_at: new Date().toISOString(),
      };

      if (setting === 'is_monitored') {
        updateData.is_monitored = Boolean(value);
        updateData.monitoring_enabled = Boolean(value);
      }
      if (setting === 'auto_hide_enabled') updateData.auto_hide_enabled = Boolean(value);
      if (setting === 'auto_approve_safe') updateData.auto_approve_safe = Boolean(value);

      const { data: updated, error: updateErr } = await supabase
        .from('facebook_pages')
        .update(updateData)
        .eq('id', pageDbId)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      await supabase.from('audit_logs').insert({
        admin_id: admin.id,
        action: `UPDATE_PAGE_${setting.toUpperCase()}`,
        entity_type: 'facebook_pages',
        entity_id: pageDbId,
        details: { setting, newValue: Boolean(value) },
      });

      return NextResponse.json({ success: true, page: updated });
    }

    if (action === 'disconnect') {
      const { pageDbId } = body;
      if (!pageDbId) {
        return NextResponse.json({ error: 'Missing pageDbId' }, { status: 400 });
      }

      // Delete page (cascade deletes tokens, posts, comments)
      const { error: delErr } = await supabase
        .from('facebook_pages')
        .delete()
        .eq('id', pageDbId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await supabase.from('audit_logs').insert({
        admin_id: admin.id,
        action: 'DISCONNECT_FACEBOOK_PAGE',
        entity_type: 'facebook_pages',
        entity_id: pageDbId,
        details: { pageDbId },
      });

      return NextResponse.json({ success: true, pageDbId });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
