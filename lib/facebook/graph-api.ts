import crypto from 'crypto';

const GRAPH_API_VERSION = 'v19.0';
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
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(pageId)}/subscribed_apps`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscribed_fields: ['feed'],
        access_token: pageAccessToken,
      }),
    });

    const json = await response.json();

    if (!response.ok || json.error) {
      const err = json.error as FacebookGraphError;
      return {
        success: false,
        error: `Webhook Subscription Error (${err?.code || response.status}): ${err?.message || 'Failed to subscribe page to feed webhooks'}`,
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: `Network failure subscribing to Facebook webhooks: ${err.message}`,
    };
  }
}

/**
 * Tests page token validity and inspects granted permissions.
 */
export async function inspectPageToken(pageAccessToken: string): Promise<{
  valid: boolean;
  permissions?: string[];
  error?: string;
}> {
  try {
    const url = `${GRAPH_API_BASE}/me/permissions?access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json.error) {
      return {
        valid: false,
        error: json.error?.message || 'Invalid or expired Page access token',
      };
    }

    const permissions: string[] = (json.data || [])
      .filter((p: any) => p.status === 'granted')
      .map((p: any) => p.permission);

    return {
      valid: true,
      permissions,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Failed to inspect token: ${err.message}`,
    };
  }
}
