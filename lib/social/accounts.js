// social_accounts repo. Tokens are stored through the shared secretCrypto
// vault (same envelope as user_api_keys) and NEVER leave the server: the
// client-facing shape (toSafe) omits access_token / refresh_token entirely.
// Internal callers that must sign a platform request use getWithToken().

import crypto from 'crypto';
import { db } from '../db.js';
import { encryptSecret, decryptSecret } from '../secretCrypto.js';
import { platformLabel } from './platforms.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[social/accounts/${msg}] ${error.message}`);
};

const COLUMNS = 'id, org_id, platform, handle, external_id, access_token, refresh_token, expires_at, scopes, sandbox, connected_by, created_at, updated_at';

// Client-safe projection — no tokens, ever.
function toSafe(r) {
  return {
    id: r.id,
    platform: r.platform,
    label: platformLabel(r.platform),
    handle: r.handle,
    externalId: r.external_id,
    expiresAt: r.expires_at,
    scopes: r.scopes,
    sandbox: !!r.sandbox,
    connectedBy: r.connected_by,
    createdAt: r.created_at,
  };
}

// Internal projection — decrypted tokens attached. Callers must never pass
// this to a response.
function toInternal(r) {
  return {
    ...toSafe(r),
    orgId: r.org_id,
    accessToken: decryptSecret(r.access_token),
    refreshToken: r.refresh_token ? decryptSecret(r.refresh_token) : null,
  };
}

export async function listSafe(orgId) {
  const { data, error } = await db().from('social_accounts')
    .select(COLUMNS).eq('org_id', orgId).order('created_at', { ascending: true });
  throwOn('listSafe', error);
  return (data || []).map(toSafe);
}

// Every connected account for a platform across an org (used by the metrics
// poller and publish fan-out).
export async function listInternal(orgId, { platform } = {}) {
  let q = db().from('social_accounts').select(COLUMNS).eq('org_id', orgId);
  if (platform) q = q.eq('platform', platform);
  const { data, error } = await q;
  throwOn('listInternal', error);
  return (data || []).map(toInternal);
}

export async function getInternal(orgId, id) {
  const { data, error } = await db().from('social_accounts')
    .select(COLUMNS).eq('org_id', orgId).eq('id', id).maybeSingle();
  throwOn('getInternal', error);
  return data ? toInternal(data) : null;
}

// Upsert on (org, platform, external_id) so reconnecting the same account
// refreshes its tokens in place rather than duplicating it.
export async function connect(orgId, { platform, handle, externalId, accessToken, refreshToken, expiresAt, scopes, sandbox, connectedBy }) {
  const row = {
    id: `sacc_${crypto.randomBytes(8).toString('hex')}`,
    org_id: orgId,
    platform,
    handle: handle || null,
    external_id: externalId || null,
    access_token: encryptSecret(accessToken),
    refresh_token: refreshToken ? encryptSecret(refreshToken) : null,
    expires_at: expiresAt || null,
    scopes: scopes || null,
    sandbox: !!sandbox,
    connected_by: connectedBy || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from('social_accounts')
    .upsert(row, { onConflict: 'org_id,platform,external_id' })
    .select(COLUMNS).maybeSingle();
  throwOn('connect', error);
  return toSafe(data);
}

// Persist refreshed tokens for an existing account.
export async function updateTokens(id, { accessToken, refreshToken, expiresAt }) {
  const patch = { updated_at: new Date().toISOString() };
  if (accessToken !== undefined) patch.access_token = encryptSecret(accessToken);
  if (refreshToken !== undefined) patch.refresh_token = refreshToken ? encryptSecret(refreshToken) : null;
  if (expiresAt !== undefined) patch.expires_at = expiresAt;
  const { error } = await db().from('social_accounts').update(patch).eq('id', id);
  throwOn('updateTokens', error);
}

export async function disconnect(orgId, id) {
  const { error } = await db().from('social_accounts').delete().eq('org_id', orgId).eq('id', id);
  throwOn('disconnect', error);
}

// First connected account for an org on a given platform — the Feed block
// references a platform, and the public renderer resolves it to the org's
// account for that platform.
export async function firstForPlatform(orgId, platform) {
  const { data, error } = await db().from('social_accounts')
    .select(COLUMNS).eq('org_id', orgId).eq('platform', platform)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  throwOn('firstForPlatform', error);
  return data ? toInternal(data) : null;
}

// Distinct org ids that have at least one connected account — the
// metrics-poll cron's work list (avoids scanning the orgs table).
export async function listOrgIds() {
  const { data, error } = await db().from('social_accounts').select('org_id');
  throwOn('listOrgIds', error);
  return [...new Set((data || []).map((r) => r.org_id))];
}

// Accounts whose access token expires within `withinMs` (default 7 days) —
// the refresh worker's work list. Sandbox accounts are excluded (their fake
// tokens are effectively immortal).
export async function listExpiring(withinMs = 7 * 86400000) {
  const cutoff = new Date(Date.now() + withinMs).toISOString();
  const { data, error } = await db().from('social_accounts')
    .select(COLUMNS).eq('sandbox', false).not('expires_at', 'is', null).lte('expires_at', cutoff);
  throwOn('listExpiring', error);
  return (data || []).map(toInternal);
}
