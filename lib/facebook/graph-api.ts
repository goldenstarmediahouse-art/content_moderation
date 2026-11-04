import crypto from 'crypto';
import { normalizePageAccessToken } from './page-access-token';

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
 * Verifies the token against Meta Graph API directly, resolves the Page identity,
 * and validates debug scopes when Meta App credentials are configured.
 */
export async function inspectPageToken(
  pageAccessToken: string,
  expectedPageId?: string
): Promise<{
  valid: boolean;
  permissions?: string[];
  pageId?: string;
  pageName?: string;
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

    // 1. Direct Page identity verification via Meta Graph API /me endpoint.
    // For a Page Access Token, /me resolves to the Page itself without needing app credentials.
    const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id,name,category`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
      },
    });

    const meJson = await meResponse.json();

    if (!meResponse.ok || meJson.error) {
      const err = meJson.error as FacebookGraphError;
      const formattedError = formatMetaError(err);
      return {
        valid: false,
        error: sanitizeMetaError(formattedError, pageAccessToken, appId, appSecret),
      };
    }

    const verifiedPageId = meJson.id as string;
    const verifiedPageName = meJson.name as string | undefined;

    // Validate page identity matches expectedPageId if provided
    if (expectedPageId && verifiedPageId !== expectedPageId) {
      return {
        valid: false,
        pageId: verifiedPageId,
        pageName: verifiedPageName,
        error: `The provided Page Access Token is for "${verifiedPageName || verifiedPageId}" (ID: ${verifiedPageId}), not for the expected Page ID ${expectedPageId}.`,
      };
    }

    // 2. Rich scope inspection via /debug_token if Meta App credentials are configured.
    let grantedPermissions: string[] = ['pages_manage_metadata', 'pages_read_engagement'];

    if (appId && appSecret) {
      const appAccessToken = `${appId}|${appSecret}`;
      const debugUrl = `${GRAPH_API_BASE}/debug_token?input_token=${encodeURIComponent(pageAccessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
      const debugResponse = await fetch(debugUrl, { method: 'GET' });
      const debugJson = await debugResponse.json();
      const debug = debugJson.data;

      if (debugResponse.ok && debug) {
        if (debug.is_valid !== true) {
          const rawMsg = debug.error?.message || 'Meta reports that the Page Access Token is invalid or expired.';
          return {
            valid: false,
            pageId: verifiedPageId,
            pageName: verifiedPageName,
            error: sanitizeMetaError(rawMsg, pageAccessToken, appAccessToken, appId, appSecret),
          };
        }

        if (debug.app_id && debug.app_id !== appId) {
          return {
            valid: false,
            pageId: verifiedPageId,
            pageName: verifiedPageName,
            error: 'The Page Access Token was issued for a different Meta App. It must match your configured META_APP_ID.',
          };
        }

        if (debug.type && debug.type !== 'PAGE') {
          return {
            valid: false,
            pageId: verifiedPageId,
            pageName: verifiedPageName,
            error: `The supplied token is a ${debug.type} token. A Facebook Page Access Token is required.`,
          };
        }

        const debugScopes: string[] = Array.isArray(debug.scopes) ? debug.scopes : [];
        if (debugScopes.length > 0) {
          grantedPermissions = debugScopes;
        }

        const granularScopes = Array.isArray(debug.granular_scopes) ? debug.granular_scopes : [];
        const isPermissionGrantedForPage = (permission: string) => {
          if (!grantedPermissions.includes(permission)) return false;
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
            permissions: grantedPermissions,
            pageId: verifiedPageId,
            pageName: verifiedPageName,
            error: `The Page Access Token is missing required permission(s): ${missingPermissions.join(', ')}. Please ensure these permissions are granted in the Meta App or Business Suite.`,
          };
        }
      }
    }

    return {
      valid: true,
      permissions: grantedPermissions,
      pageId: verifiedPageId,
      pageName: verifiedPageName,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: sanitizeMetaError(
        `Failed to inspect Page Access Token: ${err.message}`,
        pageAccessToken,
        process.env.META_APP_ID,
        process.env.META_APP_SECRET
      ),
    };
  }
}

function formatMetaError(error: FacebookGraphError | undefined): string {
  if (!error) return 'Meta rejected the request without an error message.';
  if (error.code === 190) {
    return 'The Page Access Token is invalid or has expired (Meta Error 190). Please generate a fresh Page Access Token.';
  }
  if (error.code === 200) {
    return `Meta permission error: ${error.message}. Ensure the token has permissions for this Facebook Page.`;
  }
  return error.message || `Meta API Error (${error.code || 'unknown'})`;
}

export function sanitizeMetaError(message: string, ...credentials: (string | undefined)[]): string {
  let safeMessage = message;
  for (const credential of credentials) {
    if (credential && credential.trim().length > 0) {
      safeMessage = safeMessage.split(credential).join('[REDACTED]');
    }
  }
  return safeMessage;
}
