// Storage for user-supplied API keys (Claude, ChatGPT) -- the "Connect"
// flow for key-based services with no OAuth login screen. See
// lib/ai.js / lib/openai.js for the test-call validation done before a key
// is ever stored. Never expose `api_key` itself to any client-facing route
// -- only listConnected()'s booleans are safe to return from server.js.
//
// Keys are encrypted at rest (AES-256-GCM) -- these are OUR CUSTOMERS'
// Anthropic/OpenAI credentials; a database leak must not burn their
// accounts. Rows written before encryption shipped are plaintext; get()
// transparently reads both and re-encrypts legacy rows on next write.

import crypto from 'crypto';
import { db } from './db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[apiKeys/${msg}] ${error.message}`);
};

export const PROVIDERS = ['claude', 'chatgpt'];

// Derive a stable 32-byte key from the configured secret. Falls back to
// CLERK_SECRET_KEY so encryption works without new env setup, but set
// API_KEY_ENCRYPTION_SECRET explicitly so key rotation isn't accidentally
// tied to rotating Clerk credentials (which would orphan stored keys).
function encryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('API_KEY_ENCRYPTION_SECRET (or CLERK_SECRET_KEY) is required to store API keys');
  return crypto.createHash('sha256').update(secret).digest();
}

const ENC_PREFIX = 'enc:v1:';

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${ENC_PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

function decrypt(stored) {
  if (!stored) return null;
  // Legacy plaintext row (written before encryption shipped).
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const [ivB64, tagB64, ctB64] = stored.slice(ENC_PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

export async function get(orgId, email, provider) {
  const { data, error } = await db()
    .from('user_api_keys')
    .select('api_key')
    .eq('org_id', orgId).eq('user_email', email).eq('provider', provider)
    .maybeSingle();
  throwOn('get', error);
  return data?.api_key ? decrypt(data.api_key) : null;
}

export async function set(orgId, email, provider, apiKey) {
  const { error } = await db().from('user_api_keys').upsert({
    org_id: orgId, user_email: email, provider, api_key: encrypt(apiKey),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,user_email,provider' });
  throwOn('set', error);
}

export async function remove(orgId, email, provider) {
  const { error } = await db().from('user_api_keys')
    .delete().eq('org_id', orgId).eq('user_email', email).eq('provider', provider);
  throwOn('remove', error);
}

export async function listConnected(orgId, email) {
  const { data, error } = await db()
    .from('user_api_keys')
    .select('provider')
    .eq('org_id', orgId).eq('user_email', email);
  throwOn('listConnected', error);
  const connected = new Set((data || []).map((r) => r.provider));
  return Object.fromEntries(PROVIDERS.map((p) => [p, connected.has(p)]));
}
