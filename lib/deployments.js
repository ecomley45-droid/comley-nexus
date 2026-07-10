// site_deployments store — the "live" snapshot a staging-enabled workspace's
// public site is served from. A Deploy captures the current working pages +
// library + settings into a new row; the public render reads getLatest().
//
// Org-scoped like everything in storage.js. content_hash is a cheap digest of
// the promoted content so the UI can tell whether the working copy has drifted
// from what's live ("you have undeployed changes").

import crypto from 'crypto';
import { db } from './db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[deployments/${msg}] ${error.message}`);
};

const newId = () => 'dep-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);

// Stable hash of the deployable content. Pages/settings only — library is
// derived styling, not user-visible content drift worth nagging about.
export function contentHash(pages, settings) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ pages: pages || [], settings: settings || {} }))
    .digest('hex');
}

// Promote a working snapshot to live. Returns the new deployment's id + hash.
export async function deploy(orgId, { pages, library, settings, deployedBy }) {
  const id = newId();
  const hash = contentHash(pages, settings);
  const { error } = await db().from('site_deployments').insert({
    id, org_id: orgId,
    pages: pages || [], library: library || [], settings: settings || {},
    content_hash: hash, deployed_by: deployedBy || null,
  });
  throwOn('deploy', error);
  return { id, contentHash: hash };
}

// The current live snapshot (newest). Public render calls this on every hit,
// so it selects the full jsonb in one query.
export async function getLatest(orgId) {
  const { data, error } = await db().from('site_deployments')
    .select('id, pages, library, settings, content_hash, deployed_at, deployed_by')
    .eq('org_id', orgId)
    .order('deployed_at', { ascending: false })
    .limit(1).maybeSingle();
  throwOn('getLatest', error);
  if (!data) return null;
  return {
    id: data.id, pages: data.pages || [], library: data.library || [],
    settings: data.settings || {}, contentHash: data.content_hash,
    deployedAt: data.deployed_at, deployedBy: data.deployed_by,
  };
}

// Lightweight status (no big jsonb) for the deploy bar.
export async function latestMeta(orgId) {
  const { data, error } = await db().from('site_deployments')
    .select('id, content_hash, deployed_at, deployed_by')
    .eq('org_id', orgId)
    .order('deployed_at', { ascending: false })
    .limit(1).maybeSingle();
  throwOn('latestMeta', error);
  return data ? { id: data.id, contentHash: data.content_hash, deployedAt: data.deployed_at, deployedBy: data.deployed_by } : null;
}

// Keep the last `keep` snapshots per org; drop older ones. Called after each
// deploy so the table can't grow unbounded (snapshots are large).
export async function prune(orgId, keep = 20) {
  const { data, error } = await db().from('site_deployments')
    .select('id').eq('org_id', orgId)
    .order('deployed_at', { ascending: false })
    .range(keep, keep + 1000);
  throwOn('prune.select', error);
  if (data && data.length) {
    const { error: delErr } = await db().from('site_deployments').delete().in('id', data.map((r) => r.id));
    throwOn('prune.delete', delErr);
  }
  return data ? data.length : 0;
}
