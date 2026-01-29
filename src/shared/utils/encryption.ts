/**
 * Encryption Utilities
 * Uses AES-256-GCM for secure storage of sensitive data
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config/index.js';

// Configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a text string
 */
export function encrypt(text: string): string {
  // Config validation
  const keyBuffer = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`Invalid encryption key length. Expected ${KEY_LENGTH} bytes.`);
  }

  // Generate random IV
  const iv = randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Return format: IV:AuthTag:EncryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a text string
 */
export function decrypt(text: string): string {
  // Config validation
  const keyBuffer = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`Invalid encryption key length. Expected ${KEY_LENGTH} bytes.`);
  }

  // Parse parts
  const parts = text.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  // Create decipher
  const decipher = createDecipheriv(
    ALGORITHM,
    keyBuffer,
    Buffer.from(ivHex, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  // Decrypt
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
