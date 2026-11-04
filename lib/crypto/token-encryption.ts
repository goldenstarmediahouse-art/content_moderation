import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16; // Standard 128-bit authentication tag

function getEncryptionKey(): Buffer {
  const hexKey = process.env.ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error('Token encryption key is not configured.');
  }

  if (hexKey.length === 64) {
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error('Token encryption key has an invalid format.');
    }
    return Buffer.from(hexKey, 'hex');
  }

  const keyBuffer = Buffer.from(hexKey, 'utf-8');
  if (keyBuffer.length !== 32) {
    return crypto.createHash('sha256').update(hexKey).digest();
  }

  return keyBuffer;
}

/**
 * Encrypts a sensitive string (e.g., Facebook Page Access Token)
 * Returns a Buffer containing: [IV (12 bytes)] + [Auth Tag (16 bytes)] + [Ciphertext]
 */
export function encryptToken(plainText: string): Buffer {
  if (!plainText) {
    throw new Error('Cannot encrypt empty or null token.');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine IV + AuthTag + Encrypted data
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts a binary buffer containing [IV] + [Auth Tag] + [Ciphertext]
 * Returns original plaintext string. Throws error if corrupted or tampered.
 */
export function decryptToken(encryptedData: Buffer | string): string {
  if (!encryptedData) {
    throw new Error('Stored token data is missing.');
  }

  let buffer: Buffer;
  if (typeof encryptedData === 'string') {
    if (encryptedData.startsWith('\\x')) {
      const hexPayload = encryptedData.slice(2);
      if (!hexPayload || hexPayload.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hexPayload)) {
        throw new Error('Stored token data has an invalid bytea encoding.');
      }
      buffer = Buffer.from(hexPayload, 'hex');
    } else {
      if (encryptedData.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(encryptedData)) {
        buffer = Buffer.from(encryptedData, 'hex');
      } else {
        buffer = Buffer.from(encryptedData, 'base64');
      }
    }
  } else {
    buffer = encryptedData;
  }

  buffer = restoreLegacyBufferSerialization(buffer);

  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Stored token data is incomplete.');
  }

  const key = getEncryptionKey();
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function restoreLegacyBufferSerialization(buffer: Buffer): Buffer {
  if (buffer[0] !== 0x7b || buffer[buffer.length - 1] !== 0x7d) {
    return buffer;
  }

  try {
    const serialized = JSON.parse(buffer.toString('utf8')) as {
      type?: unknown;
      data?: unknown;
    };

    if (
      serialized.type !== 'Buffer'
      || !Array.isArray(serialized.data)
      || !serialized.data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      return buffer;
    }

    return Buffer.from(serialized.data);
  } catch {
    return buffer;
  }
}
