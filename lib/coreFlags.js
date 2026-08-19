// Feature flags now live in nexus-core's Supabase project, not in this
// app's own `orgs.feature_flags` column — see
// comley-nexus-ecosystem-migration-plan.md Phase B. The column stays in
// orgs (harmless, unused going forward) rather than being dropped, so this
// remains reversible.
//
// Mirrors @comley/nexus-core's feature_flags helpers
// (nexus-core/packages/core/src/index.js) inline rather than as a package
// dependency — this app deploys independently (Vercel) and can't depend on
// a sibling local repo.
//
// Cached with a short TTL: orgForUser() (lib/storage.js) sits on the hot
// auth path — every request from a signed-in member resolves their org —
// so an uncached read here would mean a cross-project Supabase call per
// request, and a Core outage would take CMS auth down with it. A failed
// Core read falls back to the last cached value (or {} if none yet)
// instead of failing the request.

import { createClient } from '@supabase/supabase-js';

const APP_KEY = 'cms';
const CACHE_TTL_MS = 30_000;

const coreUrl = process.env.CORE_SUPABASE_URL;
const coreKey = process.env.CORE_SUPABASE_SERVICE_ROLE_KEY;
const core = coreUrl && coreKey ? createClient(coreUrl, coreKey) : null;
if (!core) console.warn('[coreFlags] CORE_SUPABASE_URL/CORE_SUPABASE_SERVICE_ROLE_KEY not set — feature flags will read as {}.');

const cache = new Map(); // orgId -> { flags, at }

export async function getOrgFlags(orgId) {
  if (!core) return {};
  const cached = cache.get(orgId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.flags;
  try {
    const { data, error } = await core.from('feature_flags').select('flag_key, value').eq('app_key', APP_KEY).eq('org_id', orgId);
    if (error) throw error;
    const flags = Object.fromEntries((data || []).map((r) => [r.flag_key, r.value]));
    cache.set(orgId, { flags, at: Date.now() });
    return flags;
  } catch (e) {
    console.error('[coreFlags] getOrgFlags failed, falling back to cached/empty:', e.message);
    return cached?.flags || {};
  }
}

// Batch variant for orgs.list() — one Core query instead of N.
export async function getFlagsForOrgs(orgIds) {
  if (!core || orgIds.length === 0) return {};
  try {
    const { data, error } = await core.from('feature_flags').select('org_id, flag_key, value').eq('app_key', APP_KEY).in('org_id', orgIds);
    if (error) throw error;
    const byOrg = {};
    for (const id of orgIds) byOrg[id] = {};
    for (const row of data || []) byOrg[row.org_id][row.flag_key] = row.value;
    for (const [id, flags] of Object.entries(byOrg)) cache.set(id, { flags, at: Date.now() });
    return byOrg;
  } catch (e) {
    console.error('[coreFlags] getFlagsForOrgs failed, falling back to cached/empty per org:', e.message);
    return Object.fromEntries(orgIds.map((id) => [id, cache.get(id)?.flags || {}]));
  }
}

// Full replace — matches this app's existing semantics (every call site
// spreads the current object before adding/changing one key, so a plain
// upsert-all-provided-keys never silently drops a key in practice).
//
// A null/undefined value means "clear this flag" (e.g. server.js's
// `custom_domain_request: raw || null`) — feature_flags.value is NOT NULL,
// so that case deletes the row instead of upserting a SQL NULL into it.
export async function setOrgFlags(orgId, flags) {
  cache.delete(orgId); // invalidate so the next read reflects this write, even on failure below
  if (!core) return;
  const entries = Object.entries(flags || {});
  const toUpsert = entries.filter(([, v]) => v !== null && v !== undefined);
  const toClear = entries.filter(([, v]) => v === null || v === undefined).map(([k]) => k);

  if (toUpsert.length) {
    const rows = toUpsert.map(([flag_key, value]) => ({
      app_key: APP_KEY, org_id: orgId, flag_key, value, updated_at: new Date().toISOString(),
    }));
    const { error } = await core.from('feature_flags').upsert(rows, { onConflict: 'app_key,org_id,flag_key' });
    if (error) throw error;
  }
  if (toClear.length) {
    const { error } = await core.from('feature_flags').delete().eq('app_key', APP_KEY).eq('org_id', orgId).in('flag_key', toClear);
    if (error) throw error;
  }
}

export async function removeOrgFlags(orgId) {
  cache.delete(orgId);
  if (!core) return;
  const { error } = await core.from('feature_flags').delete().eq('app_key', APP_KEY).eq('org_id', orgId);
  if (error) throw error;
}
