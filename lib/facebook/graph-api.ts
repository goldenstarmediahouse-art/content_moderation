import crypto from 'crypto';
import { normalizePageAccessToken } from '@/lib/facebook/page-access-token';

const GRAPH_API_VERSION = 'v26.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface FacebookPageAccount {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  tasks?: string[];
  perms?: string[];
}

export interface FacebookGraphError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

/**
 * Verifies Meta Webhook HMAC-SHA256 signature against the raw payload
 * Header format: sha256=<signature>
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string
): boolean {
  const secret = appSecret || process.env.META_APP_SECRET;
  if (!secret) {
    console.error('META_APP_SECRET is not configured for signature verification.');
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedSignature = parts[1];
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody, 'utf8');
  const calculatedSignature = hmac.digest('hex');

  // Use timingSafeEqual to avoid timing attack vulnerabilities
  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const calculatedBuffer = Buffer.from(calculatedSignature, 'hex');
    if (expectedBuffer.length !== calculatedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
  } catch {
    return false;
  }
}

/**
 * Hides a public Facebook comment via Graph API.
 * Endpoint: POST /{comment-id} with is_hidden=true
 */
export async function hideFacebookComment(
  commentId: string,
  pageAccessToken: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(commentId)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        is_hidden: true,
        access_token: pageAccessToken,
      }),
    });

    const json = await response.json();

    if (!response.ok || json.error) {
      const err = json.error as FacebookGraphError;
      return {
        success: false,
        error: `Meta API Error (${err?.code || response.status}): ${err?.message || 'Failed to hide comment'}`,
      };
    }

    return { success: true, data: json };
  } catch (err: any) {
    return {
      success: false,
      error: `Network/Request failure while hiding Facebook comment: ${err.message}`,
    };
  }
}

/**
 * Unhides/Restores a mistakenly hidden comment via Graph API.
 * Endpoint: POST /{comment-id} with is_hidden=false
 */
export async function unhideFacebookComment(
  commentId: string,
  pageAccessToken: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(commentId)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        is_hidden: false,
        access_token: pageAccessToken,
      }),
    });

    const json = await response.json();

    if (!response.ok || json.error) {
      const err = json.error as FacebookGraphError;
      return {
        success: false,
        error: `Meta API Error (${err?.code || response.status}): ${err?.message || 'Failed to unhide comment'}`,
      };
    }

    return { success: true, data: json };
  } catch (err: any) {
    return {
      success: false,
      error: `Network/Request failure while restoring Facebook comment: ${err.message}`,
    };
  }
}

/**
 * Subscribes a Facebook Page to feed webhooks for real-time comment ingestion.
 * Endpoint: POST /{page-id}/subscribed_apps?subscribed_fields=feed
 */
export async function subscribePageToWebhooks(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean; errorCode?: number | string; errorMessage?: string }> {
  try {
    const tokenValidation = normalizePageAccessToken(pageAccessToken);
    if (!pageId || !tokenValidation.valid) {
      return {
        success: false,
        errorCode: 'MISSING_PAGE_ID_OR_TOKEN',
        errorMessage: tokenValidation.valid
          ? 'A Facebook Page ID is required.'
          : tokenValidation.error,
      };
    }
    pageAccessToken = tokenValidation.token;

    const url = `${GRAPH_API_BASE}/${encodeURIComponent(pageId)}/subscribed_apps`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: new URLSearchParams({
        subscribed_fields: 'feed',
        access_token: pageAccessToken,
      }),
    });

    const json = await response.json();

    if (!response.ok || json.error || json.success !== true) {
      const err = json.error as FacebookGraphError;
      const errorCode = err?.code ?? response.status;
      const errorMessage = redactAccessToken(
        err?.message || 'Meta did not confirm the Page feed webhook subscription.',
        pageAccessToken
      );
      console.error('Facebook Page webhook subscription failed', { errorCode, errorMessage });
      return {
        success: false,
        errorCode,
        errorMessage,
      };
    }

    return { success: true };
  } catch (err: any) {
    const errorMessage = redactAccessToken(
      err?.message || 'Unknown network error while subscribing the Page to webhooks.',
      pageAccessToken
    );
    console.error('Facebook Page webhook subscription request failed', {
      errorCode: 'NETWORK_ERROR',
      errorMessage,
    });
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage,
    };
  }
}

function redactAccessToken(message: string, pageAccessToken: string): string {
  return pageAccessToken ? message.split(pageAccessToken).join('[REDACTED]') : message;
}

/**
 * Tests page token validity and inspects granted permissions.
 */
export async function inspectPageToken(
  pageAccessToken: string,
  expectedPageId?: string
): Promise<{
  valid: boolean;
  permissions?: string[];
  pageId?: string;
  error?: string;
}> {
  try {
    const tokenValidation = normalizePageAccessToken(pageAccessToken);
    if (!tokenValidation.valid) {
      return { valid: false, error: tokenValidation.error };
    }
    pageAccessToken = tokenValidation.token;

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return {
        valid: false,
        error: 'Meta token validation is not configured on the server (META_APP_ID and META_APP_SECRET are required).',
      };
    }

    const appAccessToken = `${appId}|${appSecret}`;
    const debugResponse = await fetch(`${GRAPH_API_BASE}/debug_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        input_token: pageAccessToken,
        access_token: appAccessToken,
      }),
    });
    const debugJson = await debugResponse.json();
    const debug = debugJson.data;

    if (!debugResponse.ok || debugJson.error || !debug) {
      return {
        valid: false,
        error: sanitizeMetaError(
          debugJson.error?.message || 'Meta could not inspect the Page Access Token.',
          pageAccessToken,
          appAccessToken,
          appId,
          appSecret
        ),
      };
    }

    if (debug.is_valid !== true) {
      return {
        valid: false,
        error: debug.error?.message
          ? sanitizeMetaError(debug.error.message, pageAccessToken, appAccessToken, appId, appSecret)
          : 'Meta reports that the Page Access Token is invalid or expired.',
      };
    }

    if (debug.app_id !== appId) {
      return {
        valid: false,
        error: 'The Page Access Token was issued for a different Meta app.',
      };
    }

    if (debug.type !== 'PAGE') {
      return {
        valid: false,
        error: 'The supplied token is not a Page Access Token.',
      };
    }

    if (expectedPageId && debug.profile_id && debug.profile_id !== expectedPageId) {
      return {
        valid: false,
        pageId: debug.profile_id,
        error: 'The Page Access Token is associated with a different Facebook Page.',
      };
    }

    let verifiedPageId = debug.profile_id as string | undefined;
    if (expectedPageId && !verifiedPageId) {
      const pageResponse = await fetch(
        `${GRAPH_API_BASE}/${encodeURIComponent(expectedPageId)}?fields=id`,
        {
          headers: { Authorization: `Bearer ${pageAccessToken}` },
        }
      );
      const pageJson = await pageResponse.json();
      if (!pageResponse.ok || pageJson.error || pageJson.id !== expectedPageId) {
        return {
          valid: false,
          error: sanitizeMetaError(
            pageJson.error?.message || 'The token could not be verified for the selected Facebook Page.',
            pageAccessToken,
            appAccessToken,
            appId,
            appSecret
          ),
        };
      }
      verifiedPageId = pageJson.id;
    }

    const permissionsResponse = await fetch(`${GRAPH_API_BASE}/me/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ access_token: pageAccessToken }),
    });
    const permissionsData = await permissionsResponse.json();
    if (!permissionsResponse.ok || permissionsData.error) {
      return {
        valid: false,
        pageId: verifiedPageId,
        error: sanitizeMetaError(
          permissionsData.error?.message || 'Meta could not read permissions for this Page Access Token.',
          pageAccessToken,
          appAccessToken,
          appId,
          appSecret
        ),
      };
    }

    const permissions: string[] = (permissionsData.data || [])
      .filter((p: any) => p.status === 'granted')
      .map((p: any) => p.permission);
    const debugScopes: string[] = Array.isArray(debug.scopes) ? debug.scopes : [];
    const grantedPermissions = new Set([...permissions, ...debugScopes]);

    const granularScopes = Array.isArray(debug.granular_scopes) ? debug.granular_scopes : [];
    const isPermissionGrantedForPage = (permission: string) => {
      if (!grantedPermissions.has(permission)) return false;
      const scope = granularScopes.find((item: any) => item.scope === permission);
      return !scope?.target_ids?.length || !expectedPageId || scope.target_ids.includes(expectedPageId);
    };

    const requiredPermissions = ['pages_manage_metadata', 'pages_read_engagement'];
    const missingPermissions = requiredPermissions.filter(
      (permission) => !isPermissionGrantedForPage(permission)
    );
    if (missingPermissions.length > 0) {
      return {
        valid: false,
        permissions: Array.from(grantedPermissions),
        pageId: verifiedPageId,
        error: `The Page Access Token is missing required permission(s): ${missingPermissions.join(', ')}.`,
      };
    }

    return {
      valid: true,
      permissions: Array.from(grantedPermissions),
      pageId: verifiedPageId,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: sanitizeMetaError(
        `Failed to inspect Page Access Token: ${err.message}`,
        pageAccessToken,
        process.env.META_APP_ID || '',
        process.env.META_APP_SECRET || '',
        `${process.env.META_APP_ID || ''}|${process.env.META_APP_SECRET || ''}`
      ),
    };
  }
}

function sanitizeMetaError(message: string, ...credentials: string[]): string {
  return credentials.reduce(
    (safeMessage, credential) => credential
      ? safeMessage.split(credential).join('[REDACTED]')
      : safeMessage,
    message
  );
}
