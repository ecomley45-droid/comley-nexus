// Storage for the site-template marketplace (migration 015) and the
// per-workspace install history (migration 016). Platform templates
// (org_id = null) are seeded on first read from the hardcoded
// SITE_TEMPLATES via defaultMarketplaceTemplates(), so the marketplace is
// populated with zero manual SQL and can never drift from the array that
// also drives workspace creation.

import { createHash } from 'node:crypto';
import { db } from './db.js';
import { defaultMarketplaceTemplates, validateSitePayload } from './sitePayload.js';
import { sanitizeFullPageHtml } from './sanitize.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[siteTemplateStore/${msg}] ${error.message}`);
};

// validateSitePayload runs in the shared (browser-safe) module and can't call
// the Node sanitizer, so full-HTML pages are sanitized here before they're
// stored -- the single server-side choke point for create/update/from-site.
function cleanPayload(raw) {
  const payload = validateSitePayload(raw);
  return {
    ...payload,
    pages: payload.pages.map((p) => (p.editorMode === 'full-html' && typeof p.fullHtml === 'string'
      ? { ...p, fullHtml: sanitizeFullPageHtml(p.fullHtml) }
      : p)),
  };
}

const COLUMNS = 'id, org_id, slug, name, category, description, feature_list, payload, sort_order, is_active';

function rowToTemplate(r) {
  return {
    id: r.id,
    orgId: r.org_id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    description: r.description,
    featureList: Array.isArray(r.feature_list) ? r.feature_list : [],
    payload: r.payload || { pages: [], theme: {} },
    sortOrder: r.sort_order,
    isActive: r.is_active,
    scope: r.org_id ? 'workspace' : 'platform',
  };
}

const seedRow = (t) => ({
  id: t.id, org_id: null, slug: t.slug, name: t.name, category: t.category,
  description: t.description, feature_list: t.featureList, payload: t.payload,
  sort_order: t.sortOrder,
});

// A stable fingerprint of the parts of a platform template that come from
// code. Key order is normalised so a round trip through jsonb — which does
// not preserve it — still compares equal.
export function fingerprint(row) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
    }
    return v;
  };
  const { id, org_id: _o, ...rest } = seedRow({
    id: row.id, slug: row.slug, name: row.name, category: row.category,
    description: row.description, featureList: Array.isArray(row.feature_list) ? row.feature_list : row.featureList,
    payload: row.payload, sortOrder: row.sort_order ?? row.sortOrder,
  });
  return createHash('sha1').update(JSON.stringify(stable({ id, ...rest }))).digest('hex');
}

// Reconcile the platform templates against SITE_TEMPLATES.
//
// This used to short-circuit on "are there any platform rows at all?", which
// meant the marketplace froze at whatever SITE_TEMPLATES held the first time
// anyone opened it. Diffing by id fixed new templates appearing, but not
// changed ones: repalette a template or add pages to it and every workspace
// kept installing the version from whenever the row was first written.
//
// So each seeded row also stores the fingerprint of what was written. On
// read, a row whose current content still matches its stored fingerprint is
// untouched, and is refreshed from code. A row that no longer matches has
// been edited by a super-admin through /api/templates/:id, and is left
// exactly alone — their work is not ours to overwrite.
//
// is_active is never written here either, so deactivating stays the way to
// hide a platform template. A hard-deleted row counts as missing and returns.
async function ensureSeeded() {
  const defaults = defaultMarketplaceTemplates();
  const { data, error } = await db()
    .from('nexus_site_templates')
    .select(`${COLUMNS}, seed_hash`)
    .is('org_id', null);
  throwOn('ensureSeeded.read', error);

  const existing = new Map((data || []).map((r) => [r.id, r]));
  const writes = [];
  for (const t of defaults) {
    const row = existing.get(t.id);
    const hash = fingerprint(seedRow(t));
    if (!row) { writes.push({ ...seedRow(t), is_active: true, seed_hash: hash }); continue; }
    if (row.seed_hash === hash) continue;                    // already current
    if (row.seed_hash !== fingerprint(row)) continue;         // edited by hand
    writes.push({ ...seedRow(t), is_active: row.is_active, seed_hash: hash });
  }
  if (writes.length === 0) return;

  // Not ignoreDuplicates any more: refreshing an existing row is the point.
  // Concurrent first-reads now race to write identical content instead of
  // one of them being dropped, which is harmless.
  const { error: insErr } = await db()
    .from('nexus_site_templates')
    .upsert(writes, { onConflict: 'id' });
  throwOn('ensureSeeded.upsert', insErr);
}

// Platform templates plus (if orgId given) that workspace's own, active
// only, ordered for display.
export async function list(orgId) {
  await ensureSeeded();
  let q = db().from('nexus_site_templates').select(COLUMNS).eq('is_active', true);
  q = orgId ? q.or(`org_id.is.null,org_id.eq.${orgId}`) : q.is('org_id', null);
  const { data, error } = await q.order('sort_order', { ascending: true });
  throwOn('list', error);
  return (data || []).map(rowToTemplate);
}

export async function get(id) {
  const { data, error } = await db().from('nexus_site_templates').select(COLUMNS).eq('id', id).maybeSingle();
  throwOn('get', error);
  return data ? rowToTemplate(data) : null;
}

export async function create({ id, orgId, slug, name, category, description, featureList, payload, sortOrder }) {
  const clean = cleanPayload(payload);
  const { data, error } = await db().from('nexus_site_templates').insert({
    id, org_id: orgId || null, slug: slug || id, name, category: category || 'Business',
    description: description || '', feature_list: featureList || [], payload: clean,
    sort_order: sortOrder ?? 0,
  }).select(COLUMNS).maybeSingle();
  throwOn('create', error);
  return rowToTemplate(data);
}

export async function update(id, patch) {
  const columns = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.slug !== undefined) columns.slug = patch.slug;
  if (patch.category !== undefined) columns.category = patch.category;
  if (patch.description !== undefined) columns.description = patch.description;
  if (patch.featureList !== undefined) columns.feature_list = patch.featureList;
  if (patch.payload !== undefined) columns.payload = cleanPayload(patch.payload);
  if (patch.sortOrder !== undefined) columns.sort_order = patch.sortOrder;
  const { data, error } = await db().from('nexus_site_templates').update(columns).eq('id', id).select(COLUMNS).maybeSingle();
  throwOn('update', error);
  return data ? rowToTemplate(data) : null;
}

// Soft delete -- a workspace that already installed this template keeps its
// pages (they were copied at install time; see migration 016's note).
export async function remove(id) {
  const { error } = await db().from('nexus_site_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
  throwOn('remove', error);
}

// ---------- Install history ----------
export const installs = {
  async record(orgId, { templateId, templateName, installedBy, backupId, appliedTheme }) {
    const id = 'inst-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const { error } = await db().from('template_installs').insert({
      id, org_id: orgId, template_id: templateId, template_name: templateName || '',
      installed_by: installedBy || null, backup_id: backupId || null,
      applied_theme: appliedTheme !== false,
    });
    throwOn('installs.record', error);
    return id;
  },
  async listForOrg(orgId) {
    const { data, error } = await db()
      .from('template_installs')
      .select('id, template_id, template_name, installed_by, backup_id, applied_theme, installed_at')
      .eq('org_id', orgId)
      .order('installed_at', { ascending: false });
    throwOn('installs.listForOrg', error);
    return (data || []).map((r) => ({
      id: r.id, templateId: r.template_id, templateName: r.template_name,
      installedBy: r.installed_by, backupId: r.backup_id, appliedTheme: r.applied_theme,
      installedAt: new Date(r.installed_at).getTime(),
    }));
  },
};
