import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16; // Standard 128-bit authentication tag

function getEncryptionKey(): Buffer {
  const hexKey = process.env.ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error('ENCRYPTION_KEY environment variable is missing.');
  }

  // Key must be exactly 32 bytes (256 bits). If hex string, length is 64.
  if (hexKey.length === 64) {
    return Buffer.from(hexKey, 'hex');
  }

  const keyBuffer = Buffer.from(hexKey, 'utf-8');
  if (keyBuffer.length !== 32) {
    // If not 32 bytes, hash with SHA-256 to derive a deterministic 32-byte key
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
    throw new Error('Cannot decrypt empty or null token buffer.');
  }

  let buffer: Buffer;
  if (typeof encryptedData === 'string') {
    // Check if hex or base64 string
    if (encryptedData.startsWith('\\x')) {
      // Postgres bytea hex representation
      buffer = Buffer.from(encryptedData.slice(2), 'hex');
    } else {
      buffer = Buffer.from(encryptedData, 'hex');
      if (buffer.length === 0) {
        buffer = Buffer.from(encryptedData, 'base64');
      }
    }
  } else {
    buffer = encryptedData;
  }

  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted token payload: buffer too short.');
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
