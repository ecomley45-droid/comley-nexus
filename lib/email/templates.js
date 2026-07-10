// email_templates repo. Platform-wide gallery rows (org_id null) plus each
// workspace's own saved templates, mirroring the block-catalog scoping.

import { db } from '../db.js';
import { uid, STARTER_TEMPLATES } from './blocks.js';

const throwOn = (msg, error) => { if (error) throw new Error(`[email/templates/${msg}] ${error.message}`); };
const COLS = 'id, org_id, name, category, document, is_active, created_by, created_at, updated_at';

const toApi = (r) => ({
  id: r.id, orgId: r.org_id, name: r.name, category: r.category,
  document: r.document || {}, scope: r.org_id ? 'workspace' : 'gallery',
  createdBy: r.created_by, updatedAt: r.updated_at,
});

// The built-in starter gallery lives in code (blocks.js) rather than as
// SQL-seeded jsonb, so a renderer/model change updates it with no migration.
// Marked builtin so the UI knows they open as a starting point (a save writes
// a workspace copy), not something you can delete.
const builtins = () => STARTER_TEMPLATES.map((t) => ({ ...t, scope: 'gallery', builtin: true }));

// Built-in starters + platform DB gallery + this workspace's own, active only.
export async function list(orgId) {
  let q = db().from('email_templates').select(COLS).eq('is_active', true);
  q = orgId ? q.or(`org_id.is.null,org_id.eq.${orgId}`) : q.is('org_id', null);
  const { data, error } = await q.order('created_at', { ascending: true });
  throwOn('list', error);
  return [...builtins(), ...(data || []).map(toApi)];
}

export async function get(id, orgId) {
  const builtin = builtins().find((t) => t.id === id);
  if (builtin) return builtin;
  const { data, error } = await db().from('email_templates').select(COLS)
    .eq('id', id).or(`org_id.is.null,org_id.eq.${orgId}`).maybeSingle();
  throwOn('get', error);
  return data ? toApi(data) : null;
}

export async function save(orgId, { id, name, category, document, createdBy }) {
  const row = {
    id: id || uid('tmpl'), org_id: orgId, name: name || 'Untitled',
    category: category || 'General', document: document || {},
    created_by: createdBy || null, updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from('email_templates')
    .upsert(row, { onConflict: 'id' }).select(COLS).maybeSingle();
  throwOn('save', error);
  return toApi(data);
}

export async function remove(orgId, id) {
  // Soft delete, and only a workspace's own template (never a gallery row).
  const { error } = await db().from('email_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id).eq('org_id', orgId);
  throwOn('remove', error);
}
