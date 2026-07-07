// Storage for whole-site restore points (see migration 014_site_backups.sql).
// Org-scoped like everything in lib/storage.js -- every call takes an orgId
// and filters on it. A backup captures the full page set + the full
// global_settings object at one moment; restoring replays both through the
// normal bulkReplace / settings.replace paths.

import { db } from './db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[backupsStore/${msg}] ${error.message}`);
};

const newId = () => 'bkp-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);

// Metadata only -- the pages/settings jsonb can be large, and the list view
// never needs them (they're loaded on restore via get()).
export async function list(orgId) {
  const { data, error } = await db()
    .from('site_backups')
    .select('id, label, reason, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  throwOn('list', error);
  return (data || []).map((r) => ({
    id: r.id, label: r.label, reason: r.reason,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function get(orgId, id) {
  const { data, error } = await db()
    .from('site_backups')
    .select('id, label, reason, pages, settings, created_at')
    .eq('org_id', orgId).eq('id', id).maybeSingle();
  throwOn('get', error);
  if (!data) return null;
  return {
    id: data.id, label: data.label, reason: data.reason,
    pages: data.pages || [], settings: data.settings || {},
    createdAt: new Date(data.created_at).getTime(),
  };
}

export async function create(orgId, { label, reason = 'manual', pages, settings }) {
  const id = newId();
  const { error } = await db().from('site_backups').insert({
    id, org_id: orgId, label: label || '', reason,
    pages: pages || [], settings: settings || {},
  });
  throwOn('create', error);
  return id;
}

export async function remove(orgId, id) {
  const { error } = await db().from('site_backups').delete().eq('org_id', orgId).eq('id', id);
  throwOn('remove', error);
}

// Keep only the most recent `keep` backups for an org; delete the rest.
// Called after every create so the table can't grow unbounded.
export async function prune(orgId, keep = 10) {
  const { data, error } = await db()
    .from('site_backups')
    .select('id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(keep, keep + 1000);
  throwOn('prune.select', error);
  if (data && data.length > 0) {
    const { error: delErr } = await db().from('site_backups').delete().in('id', data.map((r) => r.id));
    throwOn('prune.delete', delErr);
  }
  return data ? data.length : 0;
}
