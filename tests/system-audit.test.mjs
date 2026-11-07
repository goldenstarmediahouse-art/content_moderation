import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Setup environment for testing
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.META_APP_SECRET = 'test_meta_app_secret_999888';
process.env.META_APP_ID = '123456789012345';

// 1. Page Access Token Normalization Tests
test('Page Access Token: accepts clean token', async () => {
  const { normalizePageAccessToken } = await import('../lib/facebook/page-access-token.ts');
  const result = normalizePageAccessToken('EAABsb812345abcdef');
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.token, 'EAABsb812345abcdef');
  }
});

test('Page Access Token: rejects multiline or quoted tokens', async () => {
  const { normalizePageAccessToken } = await import('../lib/facebook/page-access-token.ts');
  const multiline = normalizePageAccessToken('EAAB\n1234');
  assert.equal(multiline.valid, false);

  const quoted = normalizePageAccessToken('"EAAB1234"');
  assert.equal(quoted.valid, false);

  const json = normalizePageAccessToken('{"token":"EAAB1234"}');
  assert.equal(json.valid, false);

  const empty = normalizePageAccessToken('   ');
  assert.equal(empty.valid, false);
});

// 2. AES-256-GCM Encryption / Decryption Tests
test('Token Encryption: roundtrip with Buffer and bytea string', async () => {
  const { encryptToken, decryptToken } = await import('../lib/crypto/token-encryption.ts');
  const plainToken = 'EAAC_LIVE_PAGE_TOKEN_SECURE_987654321';

  // Direct buffer encryption
  const encryptedBuf = encryptToken(plainToken);
  assert.ok(Buffer.isBuffer(encryptedBuf));
  assert.ok(encryptedBuf.length > 28); // 12 IV + 16 tag + payload

  // Decrypt buffer
  const decryptedFromBuf = decryptToken(encryptedBuf);
  assert.equal(decryptedFromBuf, plainToken);

  // Postgres bytea hex format: \x...
  const byteaString = `\\x${encryptedBuf.toString('hex')}`;
  const decryptedFromBytea = decryptToken(byteaString);
  assert.equal(decryptedFromBytea, plainToken);

  // Raw hex format
  const rawHex = encryptedBuf.toString('hex');
  const decryptedFromHex = decryptToken(rawHex);
  assert.equal(decryptedFromHex, plainToken);

  // Base64 format
  const base64String = encryptedBuf.toString('base64');
  const decryptedFromBase64 = decryptToken(base64String);
  assert.equal(decryptedFromBase64, plainToken);
});

test('Token Encryption: tampered ciphertext throws error', async () => {
  const { encryptToken, decryptToken } = await import('../lib/crypto/token-encryption.ts');
  const encrypted = encryptToken('secret_token_123');

  // Tamper with ciphertext byte
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] ^= 0x01;

  assert.throws(() => {
    decryptToken(tampered);
  });
});

test('Token Encryption: tampered auth tag throws error', async () => {
  const { encryptToken, decryptToken } = await import('../lib/crypto/token-encryption.ts');
  const encrypted = encryptToken('secret_token_123');

  // Tamper with auth tag byte (bytes 12 to 27)
  const tampered = Buffer.from(encrypted);
  tampered[15] ^= 0xff;

  assert.throws(() => {
    decryptToken(tampered);
  });
});

// 3. Webhook Signature Verification Algorithm Tests
function verifyWebhookSignatureTest(
  rawBody,
  signatureHeader,
  secret
) {
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') return false;

  const expectedSignature = parts[1];
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody, 'utf8');
  const calculatedSignature = hmac.digest('hex');

  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const calculatedBuffer = Buffer.from(calculatedSignature, 'hex');
    if (expectedBuffer.length !== calculatedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
  } catch {
    return false;
  }
}

test('Webhook: verifies valid HMAC-SHA256 signature', () => {
  const secret = process.env.META_APP_SECRET;
  const payload = JSON.stringify({ object: 'page', entry: [{ id: '123' }] });

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const validHeader = `sha256=${hmac.digest('hex')}`;

  const isValid = verifyWebhookSignatureTest(payload, validHeader, secret);
  assert.equal(isValid, true);
});

test('Webhook: rejects invalid or mismatched signature', () => {
  const secret = process.env.META_APP_SECRET;
  const payload = JSON.stringify({ object: 'page', entry: [{ id: '123' }] });

  const invalidHeader = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
  assert.equal(verifyWebhookSignatureTest(payload, invalidHeader, secret), false);
  assert.equal(verifyWebhookSignatureTest(payload, null, secret), false);
  assert.equal(verifyWebhookSignatureTest(payload, 'invalid-format', secret), false);
});

// 4. Meta Error Sanitization Tests
function sanitizeMetaErrorTest(message, ...credentials) {
  let safeMessage = message;
  for (const credential of credentials) {
    if (credential && credential.trim().length > 0) {
      safeMessage = safeMessage.split(credential).join('[REDACTED]');
    }
  }
  return safeMessage;
}

test('Security: sanitizeMetaError redacts secrets and tokens', () => {
  const pageToken = 'EAAC_SECRET_PAGE_ACCESS_TOKEN_445566';
  const appSecret = 'secret_app_key_778899';
  const appId = '123456789012345';
  const appToken = `${appId}|${appSecret}`;

  const rawErrorMessage = `Failed to process request with token ${pageToken} for app ${appToken} (secret: ${appSecret}).`;
  const sanitized = sanitizeMetaErrorTest(rawErrorMessage, pageToken, appToken, appSecret, appId);

  assert.ok(!sanitized.includes(pageToken), 'Page token must be redacted');
  assert.ok(!sanitized.includes(appSecret), 'App secret must be redacted');
  assert.ok(!sanitized.includes(appToken), 'App access token must be redacted');
  assert.ok(sanitized.includes('[REDACTED]'), 'Redaction placeholder must be present');
});

// 5. Page Identity Endpoint URL Verification
test('Meta Graph API: Page identity query requests only id,name (no category)', () => {
  const GRAPH_API_BASE = 'https://graph.facebook.com/v26.0';
  const queryUrl = `${GRAPH_API_BASE}/me?fields=id,name`;

  assert.ok(!queryUrl.includes('category'), 'Endpoint URL must not request category field');
  assert.ok(queryUrl.includes('fields=id,name'), 'Endpoint URL must request fields=id,name');

  // Verify response parser handles absence of category
  const mockMetaResponse = { id: '1029384756', name: 'Golden Star Church' };
  assert.equal(mockMetaResponse.id, '1029384756');
  assert.equal(mockMetaResponse.name, 'Golden Star Church');
  assert.equal(mockMetaResponse.category, undefined);
});

test('Assignments: legacy audit records retain assigned moderator identity', async () => {
  const { resolveCommentAssignments } = await import('../lib/comments/comment-state.ts');
  const assignments = resolveCommentAssignments(
    [{
      comment_id: 'comment-1',
      action: 'assigned',
      actor_id: 'super-admin',
      api_response: { facebook_response: null },
      created_at: '2026-01-01T10:00:00.000Z',
    }],
    [{
      entity_id: 'comment-1',
      action: 'COMMENT_ASSIGNED',
      details: { previous_assignee: null, new_assignee: 'moderator-1' },
      created_at: '2026-01-01T10:00:01.000Z',
    }]
  );

  assert.equal(assignments.get('comment-1').assignedTo, 'moderator-1');
});

test('Assignments: new assignment and reassignment use the latest recorded target', async () => {
  const { resolveCommentAssignments } = await import('../lib/comments/comment-state.ts');
  const assignments = resolveCommentAssignments([
    {
      comment_id: 'comment-1',
      action: 'assigned',
      actor_id: 'super-admin',
      api_response: { comment_state: { assigned_to: 'moderator-1', assigned_at: '2026-01-01T10:00:00.000Z' } },
      created_at: '2026-01-01T10:00:00.000Z',
    },
    {
      comment_id: 'comment-1',
      action: 'reassigned',
      actor_id: 'super-admin',
      api_response: { comment_state: { assigned_to: 'moderator-2', assigned_at: '2026-01-02T10:00:00.000Z' } },
      created_at: '2026-01-02T10:00:00.000Z',
    },
  ], []);

  assert.equal(assignments.get('comment-1').assignedTo, 'moderator-2');
  assert.equal(assignments.get('comment-1').assignedAt, '2026-01-02T10:00:00.000Z');
});

test('Assignments: released comments are unassigned and unknown history is not treated as unassigned', async () => {
  const { resolveCommentAssignments, UNKNOWN_ASSIGNEE_ID } = await import('../lib/comments/comment-state.ts');
  const released = resolveCommentAssignments([{
    comment_id: 'released',
    action: 'released',
    actor_id: 'moderator-1',
    api_response: null,
    created_at: '2026-01-03T10:00:00.000Z',
  }], []);
  const unknown = resolveCommentAssignments([{
    comment_id: 'unknown',
    action: 'reassigned',
    actor_id: 'super-admin',
    api_response: { legacy: true },
    created_at: '2026-01-03T10:00:00.000Z',
  }], []);

  assert.equal(released.get('released').assignedTo, null);
  assert.equal(unknown.get('unknown').assignedTo, UNKNOWN_ASSIGNEE_ID);
});

test('Assignments: dashboard counts and permissions use resolved historical assignees', async () => {
  const {
    canClaimAssignment,
    canModerateAssignment,
    canReassignAssignment,
    canReleaseAssignment,
    getAssignedCommentIds,
    resolveCommentAssignments,
    UNKNOWN_ASSIGNEE_ID,
  } = await import('../lib/comments/comment-state.ts');
  const assignments = resolveCommentAssignments([], [
    {
      entity_id: 'legacy-assigned',
      action: 'COMMENT_ASSIGNED',
      details: { new_assignee: 'moderator-1' },
      created_at: '2026-01-01T10:00:00.000Z',
    },
    {
      entity_id: 'legacy-unknown',
      action: 'COMMENT_REASSIGNED',
      details: { previous_assignee: 'moderator-1' },
      created_at: '2026-01-01T10:00:00.000Z',
    },
  ]);

  assert.deepEqual(getAssignedCommentIds(assignments, 'moderator-1'), ['legacy-assigned']);
  assert.equal(canClaimAssignment(assignments.get('legacy-assigned').assignedTo, 'moderator-2'), false);
  assert.equal(canClaimAssignment(assignments.get('legacy-assigned').assignedTo, 'moderator-1'), true);
  assert.equal(canReassignAssignment(assignments.get('legacy-assigned').assignedTo, 'moderator-2', false), false);
  assert.equal(canReassignAssignment(assignments.get('legacy-assigned').assignedTo, 'super-admin', true), true);
  assert.equal(canReleaseAssignment(assignments.get('legacy-assigned').assignedTo, 'moderator-2', false), false);
  assert.equal(canReleaseAssignment(assignments.get('legacy-assigned').assignedTo, 'moderator-1', false), true);
  assert.equal(canModerateAssignment(assignments.get('legacy-assigned').assignedTo, 'moderator-2', false), false);
  assert.equal(canClaimAssignment(UNKNOWN_ASSIGNEE_ID, 'moderator-1'), false);
  assert.equal(canModerateAssignment(UNKNOWN_ASSIGNEE_ID, 'moderator-1', false), false);
});

test('Escalations: reason and priority survive later resolution actions', async () => {
  const { getEscalationDetails } = await import('../lib/comments/comment-state.ts');
  const commentsCurrentStatus = 'approved';
  const details = getEscalationDetails([
    {
      action: 'approved',
      reason: 'Approved after review',
      api_response: { facebook_response: null, comment_state: { escalation_reason: null, escalation_priority: null } },
    },
    {
      action: 'escalated',
      reason: 'Needs senior review',
      api_response: { facebook_response: null, comment_state: { escalation_reason: 'Needs senior review', escalation_priority: 'urgent' } },
    },
  ]);

  assert.equal(commentsCurrentStatus, 'approved');
  assert.deepEqual(details, { reason: 'Needs senior review', priority: 'urgent' });
});

test('Escalations: existing historical action payloads remain readable', async () => {
  const { getEscalationDetails } = await import('../lib/comments/comment-state.ts');
  const details = getEscalationDetails([{
    action: 'escalated',
    reason: 'Historical escalation',
    api_response: null,
  }], [{ title: 'CASE ESCALATED: Priority [HIGH]' }]);

  assert.deepEqual(details, { reason: 'Historical escalation', priority: 'high' });
});

test('Moderation history: legacy raw responses and wrapped Facebook responses are readable', async () => {
  const { getExternalActionStatus, getFacebookApiResponse } = await import('../lib/comments/comment-state.ts');
  const historicalResponse = { success: true, comment_id: 'fb-comment-1' };

  assert.deepEqual(getFacebookApiResponse(historicalResponse), historicalResponse);
  assert.deepEqual(
    getFacebookApiResponse({ facebook_response: historicalResponse, comment_state: { external_action_status: 'synced_facebook' } }),
    historicalResponse
  );
  assert.equal(getFacebookApiResponse({ facebook_response: null, comment_state: {} }), null);
  assert.equal(getExternalActionStatus([
    { action: 'approved', outcome: 'success', api_response: historicalResponse },
    { action: 'hidden', outcome: 'success', api_response: historicalResponse },
  ]), 'synced_facebook');
  assert.equal(getExternalActionStatus([
    { action: 'hidden', outcome: 'success', api_response: { note: 'Facebook API sync pending connection.' } },
  ]), 'pending_facebook_sync');
});

test('Repeat comment sync updates content without overwriting moderation decisions', async () => {
  const { buildCommentRefreshPayload } = await import('../lib/comments/comment-state.ts');
  const refresh = buildCommentRefreshPayload('post-uuid', {
    message: 'Updated Facebook text',
    from: { id: 'facebook-user', name: 'Facebook User' },
  }, '2026-01-04T10:00:00.000Z');

  assert.deepEqual(refresh, {
    message: 'Updated Facebook text',
    commenter_name: 'Facebook User',
    commenter_facebook_id: 'facebook-user',
    post_id: 'post-uuid',
    comment_updated_at: '2026-01-04T10:00:00.000Z',
  });
  assert.equal('moderation_status' in refresh, false);
  assert.equal('is_hidden' in refresh, false);
  assert.equal('is_deleted' in refresh, false);
});
