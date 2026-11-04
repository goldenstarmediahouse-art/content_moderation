import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken, encryptToken } from '@/lib/crypto/token-encryption';
import { inspectPageToken, subscribePageToWebhooks } from '@/lib/facebook/graph-api';
import { normalizePageAccessToken } from '@/lib/facebook/page-access-token';
import { Database } from '@/types/database';

type PageWebhookResult = {
  confirmed: boolean;
  errorCode?: number | string;
  errorMessage?: string;
  persistenceError?: string;
};

function getCiphertextMetadata(value: unknown) {
  if (Buffer.isBuffer(value)) {
    return {
      type: 'Buffer',
      byteaPrefixPresent: false,
      byteLength: value.length,
    };
  }

  if (typeof value !== 'string') {
    return {
      type: value == null ? 'missing' : typeof value,
      byteaPrefixPresent: false,
      byteLength: 0,
    };
  }

  const byteaPrefixPresent = value.startsWith('\\x');
  const encodedValue = byteaPrefixPresent ? value.slice(2) : value;
  const hexBytes = Buffer.from(encodedValue, 'hex');
  const bytes = byteaPrefixPresent || hexBytes.length > 0
    ? hexBytes
    : Buffer.from(encodedValue, 'base64');

  return {
    type: 'string',
    byteaPrefixPresent,
    byteLength: bytes.length,
  };
}

async function subscribeAndSaveStatus(
  supabase: ReturnType<typeof createAdminClient>,
  pageDbId: string,
  pageId: string,
  pageAccessToken: string,
  tokenInspection?: Awaited<ReturnType<typeof inspectPageToken>>
): Promise<PageWebhookResult> {
  const inspection = tokenInspection || await inspectPageToken(pageAccessToken, pageId);
  let result: PageWebhookResult;

  if (!inspection.valid) {
    result = {
      confirmed: false,
      errorCode: 'INVALID_PAGE_TOKEN',
      errorMessage: inspection.error || 'The Page Access Token is invalid or expired.',
    };
  } else if (!inspection.permissions?.includes('pages_manage_metadata')) {
    result = {
      confirmed: false,
      errorCode: 'MISSING_PERMISSION',
      errorMessage: 'The Page Access Token is missing the required pages_manage_metadata permission.',
    };
  } else {
    const subscription = await subscribePageToWebhooks(pageId, pageAccessToken);
    result = {
      confirmed: subscription.success,
      errorCode: subscription.errorCode,
      errorMessage: subscription.errorMessage,
    };
  }

  const updateData: Database['public']['Tables']['facebook_pages']['Update'] = {
    updated_at: new Date().toISOString(),
    error_message: result.confirmed
      ? null
      : `Webhook subscription failed (${result.errorCode || 'unknown'}): ${result.errorMessage || 'Unknown subscription error.'}`,
  };
  if (result.confirmed) {
    updateData.webhook_subscribed = true;
  }

  const { error } = await supabase
    .from('facebook_pages')
    .update(updateData)
    .eq('id', pageDbId);

  if (error) {
    result.persistenceError = result.confirmed
      ? `Meta confirmed the subscription, but saving its status failed: ${error.message}`
      : `Webhook subscription failed and its reason could not be saved: ${error.message}`;
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSuperAdmin();
    const body = await request.json();
    const { action } = body;
    const supabase = createAdminClient();

    if (action === 'diagnose_page_token') {
      const result = {
        pageFound: false,
        encryptedTokenFound: false,
        decryptionSuccessful: false,
        ciphertextMetadata: {
          type: 'missing',
          byteaPrefixPresent: false,
          byteLength: 0,
        },
      };

      if (!body.pageDbId) {
        return NextResponse.json({ error: 'pageDbId is required for diagnosis.' }, { status: 400 });
      }

      const { data: pages, error: pageError } = await supabase
        .from('facebook_pages')
        .select('id')
        .eq('id', body.pageDbId)
        .limit(1);

      if (!pageError && pages?.length === 1) {
        result.pageFound = true;
        const { data: tokenRecord, error: tokenError } = await supabase
          .from('page_tokens')
          .select('encrypted_access_token')
          .eq('page_id', pages[0].id)
          .maybeSingle();

        if (!tokenError && tokenRecord?.encrypted_access_token) {
          const encryptedToken: unknown = tokenRecord.encrypted_access_token;
          result.encryptedTokenFound = true;
          result.ciphertextMetadata = getCiphertextMetadata(encryptedToken);

          try {
            if (Buffer.isBuffer(encryptedToken) || typeof encryptedToken === 'string') {
              decryptToken(encryptedToken);
              result.decryptionSuccessful = true;
            }
          } catch {
            result.decryptionSuccessful = false;
          }
        }
      }

      return NextResponse.json(result);
    }

    if (action === 'connect') {
      const { pageId, name, accessToken, category } = body;
      if (!accessToken) {
        return NextResponse.json({ error: 'A Facebook Page Access Token is required.' }, { status: 400 });
      }

      const tokenValidation = normalizePageAccessToken(accessToken);
      if (!tokenValidation.valid) {
        return NextResponse.json({ error: tokenValidation.error }, { status: 400 });
      }
      const pageAccessToken = tokenValidation.token;

      let targetPageId = typeof pageId === 'string' ? pageId.trim() : '';
      let targetName = typeof name === 'string' ? name.trim() : '';

      // Test token validity with Meta and auto-detect Page ID and Name if omitted
      const tokenTest = await inspectPageToken(pageAccessToken, targetPageId || undefined);

      if (!targetPageId && tokenTest.pageId) {
        targetPageId = tokenTest.pageId;
      }
      if (!targetName && tokenTest.pageName) {
        targetName = tokenTest.pageName;
      }

      if (!targetPageId) {
        return NextResponse.json(
          { error: tokenTest.error || 'A valid Facebook Page ID could not be identified.' },
          { status: 400 }
        );
      }
      if (!targetName) {
        targetName = `Facebook Page (${targetPageId})`;
      }

      const connectionStatus = tokenTest.valid ? 'connected' : 'connection_error';
      const errorMessage = tokenTest.error || null;
      const now = new Date().toISOString();

      // Encrypt the token with AES-256-GCM before saving
      const encryptedToken = encryptToken(pageAccessToken);

      // Upsert page record
      const { data: pageRecord, error: pageErr } = await supabase
        .from('facebook_pages')
        .upsert({
          page_name: targetName,
          facebook_page_id: targetPageId,
          page_id: targetPageId,
          name: targetName,
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
          encrypted_access_token: `\\x${encryptedToken.toString('hex')}`,
          token_type: 'page_access_token',
        }, { onConflict: 'page_id' });

      if (tokenErr) {
        return NextResponse.json({ error: `Page saved but token encryption storage failed: ${tokenErr.message}` }, { status: 500 });
      }

      // Attempt subscription only with a valid token and required Meta permission.
      let webhookResult: PageWebhookResult = {
        confirmed: false,
        errorCode: 'INVALID_PAGE_TOKEN',
        errorMessage: tokenTest.error || 'The Page Access Token is invalid or expired.',
      };
      if (tokenTest.valid) {
        webhookResult = await subscribeAndSaveStatus(supabase, pageRecord.id, targetPageId, pageAccessToken, tokenTest);
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        admin_id: admin.id,
        action: 'CONNECT_FACEBOOK_PAGE',
        entity_type: 'facebook_pages',
        entity_id: pageRecord.id,
        details: {
          pageId: targetPageId,
          name: targetName,
          webhookSubscribed: webhookResult.confirmed && !webhookResult.persistenceError,
          metaConfirmedSubscription: webhookResult.confirmed,
          webhookErrorCode: webhookResult.errorCode || null,
          webhookErrorMessage: webhookResult.confirmed ? null : webhookResult.errorMessage,
          webhookStatusError: webhookResult.persistenceError || null,
        },
      });

      return NextResponse.json({
        success: true,
        page: pageRecord,
        webhookSubscribed: webhookResult.confirmed && !webhookResult.persistenceError,
        metaConfirmedSubscription: webhookResult.confirmed,
        webhookErrorCode: webhookResult.errorCode,
        webhookError: webhookResult.errorMessage,
        webhookStatusError: webhookResult.persistenceError,
        tokenValid: tokenTest.valid,
        permissions: tokenTest.permissions,
      });
    }

    if (action === 'retry_webhook_subscription') {
      const { pageDbId } = body;
      if (!pageDbId) {
        return NextResponse.json({ error: 'Missing pageDbId' }, { status: 400 });
      }

      const { data: page, error: pageError } = await supabase
        .from('facebook_pages')
        .select('id, page_id, name, connection_status')
        .eq('id', pageDbId)
        .maybeSingle();

      if (pageError) {
        return NextResponse.json({ error: pageError.message }, { status: 500 });
      }
      if (!page) {
        return NextResponse.json({ error: 'Facebook Page not found.' }, { status: 404 });
      }
      if (page.connection_status !== 'connected') {
        return NextResponse.json({ error: 'Only a connected Facebook Page can retry webhook subscription.' }, { status: 409 });
      }

      const { data: tokenRecord, error: tokenError } = await supabase
        .from('page_tokens')
        .select('encrypted_access_token')
        .eq('page_id', page.id)
        .maybeSingle();

      if (tokenError) {
        return NextResponse.json({ error: tokenError.message }, { status: 500 });
      }
      if (!tokenRecord?.encrypted_access_token) {
        return NextResponse.json({ error: 'No encrypted Page Access Token is stored for this Page.' }, { status: 409 });
      }

      let pageAccessToken: string;
      try {
        pageAccessToken = decryptToken(tokenRecord.encrypted_access_token);
      } catch {
        return NextResponse.json({
          error: 'The stored Page token could not be decrypted. Its stored format or encryption key may not match.',
        }, { status: 409 });
      }
      const webhookResult = await subscribeAndSaveStatus(
        supabase,
        page.id,
        page.page_id,
        pageAccessToken
      );

      await supabase.from('audit_logs').insert({
        admin_id: admin.id,
        action: 'RETRY_FACEBOOK_PAGE_WEBHOOK_SUBSCRIPTION',
        entity_type: 'facebook_pages',
        entity_id: page.id,
        details: {
          pageId: page.page_id,
          name: page.name,
          webhookSubscribed: webhookResult.confirmed && !webhookResult.persistenceError,
          metaConfirmedSubscription: webhookResult.confirmed,
          webhookErrorCode: webhookResult.errorCode || null,
          webhookErrorMessage: webhookResult.confirmed ? null : webhookResult.errorMessage,
          webhookStatusError: webhookResult.persistenceError || null,
        },
      });

      if (webhookResult.persistenceError) {
        return NextResponse.json({
          error: webhookResult.persistenceError,
          webhookSubscribed: false,
          metaConfirmedSubscription: webhookResult.confirmed,
          webhookErrorCode: webhookResult.errorCode,
          webhookError: webhookResult.errorMessage,
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        webhookSubscribed: webhookResult.confirmed && !webhookResult.persistenceError,
        webhookErrorCode: webhookResult.errorCode,
        webhookError: webhookResult.errorMessage,
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
