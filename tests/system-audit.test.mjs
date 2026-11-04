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
