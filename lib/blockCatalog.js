// Storage for the "Add Block +" catalog (see src/cms/lib/blocks/). Rows
// with org_id = null are the platform-wide catalog (Super-Admin-editable
// only); rows with a real org_id belong to that one workspace. `html` is
// deliberately never stored here -- it's always derived client-side from
// `default_fields` via blockRenderers.js, so a renderer change is
// reflected immediately without a data migration.

import { db } from './db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[blockCatalog/${msg}] ${error.message}`);
};

const COLUMNS = 'id, org_id, block_type, name, category, description, default_fields, sort_order, is_active';

function rowToEntry(r) {
  return {
    id: r.id,
    orgId: r.org_id,
    blockType: r.block_type,
    name: r.name,
    category: r.category,
    description: r.description,
    defaultFields: r.default_fields || {},
    sortOrder: r.sort_order,
    isActive: r.is_active,
    scope: r.org_id ? 'workspace' : 'platform',
  };
}

// Platform-wide entries plus (if orgId is given) that workspace's own,
// active-only, ordered for display.
export async function list(orgId) {
  let q = db().from('nexus_block_catalog').select(COLUMNS).eq('is_active', true);
  q = orgId ? q.or(`org_id.is.null,org_id.eq.${orgId}`) : q.is('org_id', null);
  const { data, error } = await q.order('sort_order', { ascending: true });
  throwOn('list', error);
  return (data || []).map(rowToEntry);
}

export async function get(id) {
  const { data, error } = await db().from('nexus_block_catalog').select(COLUMNS).eq('id', id).maybeSingle();
  throwOn('get', error);
  return data ? rowToEntry(data) : null;
}

export async function create({ id, orgId, blockType, name, category, description, defaultFields, sortOrder }) {
  const { data, error } = await db().from('nexus_block_catalog').insert({
    id, org_id: orgId || null, block_type: blockType, name, category,
    description: description || '', default_fields: defaultFields || {},
    sort_order: sortOrder ?? 0,
  }).select(COLUMNS).maybeSingle();
  throwOn('create', error);
  return rowToEntry(data);
}

export async function update(id, patch) {
  const columns = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.category !== undefined) columns.category = patch.category;
  if (patch.description !== undefined) columns.description = patch.description;
  if (patch.defaultFields !== undefined) columns.default_fields = patch.defaultFields;
  if (patch.sortOrder !== undefined) columns.sort_order = patch.sortOrder;
  const { data, error } = await db().from('nexus_block_catalog').update(columns).eq('id', id).select(COLUMNS).maybeSingle();
  throwOn('update', error);
  return data ? rowToEntry(data) : null;
}

// Soft delete -- see the migration's own comment on why this never needs
// to reason about pages that already used the entry.
export async function remove(id) {
  const { error } = await db().from('nexus_block_catalog').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
  throwOn('remove', error);
}
