// Storage for the site-template marketplace (migration 015) and the
// per-workspace install history (migration 016). Platform templates
// (org_id = null) are seeded on first read from the hardcoded
// SITE_TEMPLATES via defaultMarketplaceTemplates(), so the marketplace is
// populated with zero manual SQL and can never drift from the array that
// also drives workspace creation.

import { db } from './db.js';
import { defaultMarketplaceTemplates, validateSitePayload } from './sitePayload.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[siteTemplateStore/${msg}] ${error.message}`);
};

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

// Insert the four starter templates if no platform templates exist yet.
// Idempotent: upsert with ignoreDuplicates so concurrent first-reads can't
// double-insert. Only touches platform rows (org_id null).
async function ensureSeeded() {
  const { count, error } = await db()
    .from('nexus_site_templates')
    .select('id', { count: 'exact', head: true })
    .is('org_id', null);
  throwOn('ensureSeeded.count', error);
  if ((count ?? 0) > 0) return;
  const rows = defaultMarketplaceTemplates().map((t) => ({
    id: t.id, org_id: null, slug: t.slug, name: t.name, category: t.category,
    description: t.description, feature_list: t.featureList, payload: t.payload,
    sort_order: t.sortOrder, is_active: true,
  }));
  const { error: insErr } = await db()
    .from('nexus_site_templates')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  throwOn('ensureSeeded.insert', insErr);
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
  const clean = validateSitePayload(payload);
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
  if (patch.payload !== undefined) columns.payload = validateSitePayload(patch.payload);
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
