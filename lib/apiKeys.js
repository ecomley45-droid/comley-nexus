// Storage for user-supplied API keys (Claude, ChatGPT) -- the "Connect"
// flow for key-based services with no OAuth login screen. See
// lib/ai.js / lib/openai.js for the test-call validation done before a key
// is ever stored. Never expose `api_key` itself to any client-facing route
// -- only listConnected()'s booleans are safe to return from server.js.
//
// Keys are encrypted at rest (AES-256-GCM) -- these are OUR CUSTOMERS'
// Anthropic/OpenAI credentials; a database leak must not burn their
// accounts. Rows written before encryption shipped are plaintext; get()
// transparently reads both and re-encrypts legacy rows on next write. The
// cipher itself lives in lib/secretCrypto.js so social OAuth tokens share
// exactly the same vault.

import { db } from './db.js';
import { encryptSecret as encrypt, decryptSecret as decrypt } from './secretCrypto.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[apiKeys/${msg}] ${error.message}`);
};

export const PROVIDERS = ['claude', 'chatgpt'];

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
