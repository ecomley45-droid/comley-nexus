// Shared AES-256-GCM cipher for secrets we store on behalf of our
// customers -- originally the encrypt/decrypt that lived inside
// lib/apiKeys.js (Anthropic/OpenAI keys), now also the vault for social
// OAuth tokens (lib/social/accounts.js). A single module means one place
// owns the key derivation, the `enc:v1:` envelope, and the legacy-plaintext
// read path, so the two callers can never drift.
//
// NEVER hand a decrypted value to any client-facing route.

import crypto from 'crypto';

const ENC_PREFIX = 'enc:v1:';

// Derive a stable 32-byte key from the configured secret. Falls back to
// CLERK_SECRET_KEY so encryption works without new env setup, but set
// API_KEY_ENCRYPTION_SECRET explicitly so key rotation isn't accidentally
// tied to rotating Clerk credentials (which would orphan stored secrets).
function encryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('API_KEY_ENCRYPTION_SECRET (or CLERK_SECRET_KEY) is required to store secrets');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${ENC_PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(stored) {
  if (!stored) return null;
  // Legacy plaintext row (written before encryption shipped).
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const [ivB64, tagB64, ctB64] = stored.slice(ENC_PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

export const isEncrypted = (stored) => typeof stored === 'string' && stored.startsWith(ENC_PREFIX);
