// Storage for content collections (db/migrations/029_collections.sql).
//
// Tenant-scoped like the rest of lib/storage.js: every call takes an orgId
// and filters by it. Field definitions and entry data are re-validated here
// against src/shared/collectionFields.js on every write — the browser runs
// the same normalizers for immediate feedback, but the server is the
// authority, so a hand-rolled API call can't store a shape the renderers
// don't expect.

import { db } from './db.js';
import {
  normalizeFields, normalizeEntryData, missingRequired, slugify,
} from '../src/shared/collectionFields.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[collections/${msg}] ${error.message}`);
};
const assertOrg = (orgId, ctx) => {
  if (!orgId) throw new Error(`[collections/${ctx}] orgId is required`);
  return orgId;
};

const COLLECTION_COLUMNS =
  'id, org_id, name, slug, description, fields, detail_enabled, detail_base, detail_page_id, sort_order, updated_at';
const ENTRY_COLUMNS =
  'id, org_id, collection_id, slug, status, data, sort_order, updated_at';

function rowToCollection(r) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description || '',
    fields: normalizeFields(r.fields),
    detailEnabled: !!r.detail_enabled,
    detailBase: r.detail_base || '',
    detailPageId: r.detail_page_id || null,
    sortOrder: r.sort_order ?? 0,
    updatedAt: r.updated_at || null,
  };
}

function rowToEntry(r) {
  return {
    id: r.id,
    collectionId: r.collection_id,
    slug: r.slug,
    status: r.status === 'draft' ? 'draft' : 'published',
    data: r.data || {},
    sortOrder: r.sort_order ?? 0,
    updatedAt: r.updated_at || null,
  };
}

const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function list(orgId) {
  assertOrg(orgId, 'list');
  const { data, error } = await db()
    .from('collections').select(COLLECTION_COLUMNS)
    .eq('org_id', orgId).order('sort_order', { ascending: true });
  throwOn('list', error);
  return (data || []).map(rowToCollection);
}

export async function get(orgId, id) {
  assertOrg(orgId, 'get');
  const { data, error } = await db()
    .from('collections').select(COLLECTION_COLUMNS)
    .eq('org_id', orgId).eq('id', id).limit(1);
  throwOn('get', error);
  return data?.[0] ? rowToCollection(data[0]) : null;
}

export async function getBySlug(orgId, slug) {
  assertOrg(orgId, 'getBySlug');
  const { data, error } = await db()
    .from('collections').select(COLLECTION_COLUMNS)
    .eq('org_id', orgId).eq('slug', slug).limit(1);
  throwOn('getBySlug', error);
  return data?.[0] ? rowToCollection(data[0]) : null;
}

export async function create(orgId, input) {
  assertOrg(orgId, 'create');
  const name = String(input?.name || 'Untitled collection').slice(0, 80);
  const row = {
    id: newId('col'),
    org_id: orgId,
    name,
    slug: slugify(input?.slug || name, `collection-${Date.now().toString(36)}`),
    description: String(input?.description || '').slice(0, 400),
    fields: normalizeFields(input?.fields),
    detail_enabled: input?.detailEnabled === true,
    detail_base: slugify(input?.detailBase || ''),
    detail_page_id: input?.detailPageId || null,
    sort_order: Number(input?.sortOrder) || 0,
    updated_at: now(),
  };
  const { error } = await db().from('collections').insert(row);
  throwOn('create', error);
  return rowToCollection(row);
}

export async function update(orgId, id, patch) {
  assertOrg(orgId, 'update');
  const existing = await get(orgId, id);
  if (!existing) return null;
  const row = { updated_at: now() };
  if (patch.name !== undefined) row.name = String(patch.name).slice(0, 80);
  if (patch.slug !== undefined) row.slug = slugify(patch.slug, existing.slug);
  if (patch.description !== undefined) row.description = String(patch.description).slice(0, 400);
  if (patch.fields !== undefined) row.fields = normalizeFields(patch.fields);
  if (patch.detailEnabled !== undefined) row.detail_enabled = patch.detailEnabled === true;
  if (patch.detailBase !== undefined) row.detail_base = slugify(patch.detailBase || '');
  if (patch.detailPageId !== undefined) row.detail_page_id = patch.detailPageId || null;
  if (patch.sortOrder !== undefined) row.sort_order = Number(patch.sortOrder) || 0;

  const { error } = await db().from('collections').update(row).eq('org_id', orgId).eq('id', id);
  throwOn('update', error);

  // A removed or renamed field would otherwise leave orphaned keys in every
  // entry. Re-normalizing the entries against the new field list keeps the
  // stored data honest instead of accumulating invisible cruft.
  if (patch.fields !== undefined) await renormalizeEntries(orgId, id, normalizeFields(patch.fields));
  return get(orgId, id);
}

export async function remove(orgId, id) {
  assertOrg(orgId, 'remove');
  // collection_entries has ON DELETE CASCADE, so entries go with it.
  const { error } = await db().from('collections').delete().eq('org_id', orgId).eq('id', id);
  throwOn('remove', error);
  return true;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function listEntries(orgId, collectionId, { includeDrafts = true } = {}) {
  assertOrg(orgId, 'listEntries');
  let q = db().from('collection_entries').select(ENTRY_COLUMNS)
    .eq('org_id', orgId).eq('collection_id', collectionId);
  if (!includeDrafts) q = q.eq('status', 'published');
  const { data, error } = await q.order('sort_order', { ascending: true });
  throwOn('listEntries', error);
  return (data || []).map(rowToEntry);
}

export async function getEntryBySlug(orgId, collectionId, slug) {
  assertOrg(orgId, 'getEntryBySlug');
  const { data, error } = await db().from('collection_entries').select(ENTRY_COLUMNS)
    .eq('org_id', orgId).eq('collection_id', collectionId).eq('slug', slug).limit(1);
  throwOn('getEntryBySlug', error);
  return data?.[0] ? rowToEntry(data[0]) : null;
}

// Entry slugs must be unique within their collection (they're a URL segment).
async function uniqueEntrySlug(orgId, collectionId, base, ignoreId) {
  const existing = await listEntries(orgId, collectionId);
  const taken = new Set(existing.filter((e) => e.id !== ignoreId).map((e) => e.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function createEntry(orgId, collectionId, input) {
  assertOrg(orgId, 'createEntry');
  const collection = await get(orgId, collectionId);
  if (!collection) throw new Error('Collection not found');

  const data = normalizeEntryData(input?.data, collection.fields);
  const missing = missingRequired(data, collection.fields);
  if (missing.length) throw new Error(`Missing required field(s): ${missing.join(', ')}`);

  const titleKey = collection.fields[0]?.key;
  const base = slugify(input?.slug || data[titleKey] || 'entry', `entry-${Date.now().toString(36)}`);
  const row = {
    id: newId('ent'),
    org_id: orgId,
    collection_id: collectionId,
    slug: await uniqueEntrySlug(orgId, collectionId, base),
    status: input?.status === 'draft' ? 'draft' : 'published',
    data,
    sort_order: Number(input?.sortOrder) || 0,
    updated_at: now(),
  };
  const { error } = await db().from('collection_entries').insert(row);
  throwOn('createEntry', error);
  return rowToEntry(row);
}

export async function updateEntry(orgId, entryId, patch) {
  assertOrg(orgId, 'updateEntry');
  const { data: found, error: findError } = await db().from('collection_entries')
    .select(ENTRY_COLUMNS).eq('org_id', orgId).eq('id', entryId).limit(1);
  throwOn('updateEntry.find', findError);
  const entry = found?.[0] ? rowToEntry(found[0]) : null;
  if (!entry) return null;

  const collection = await get(orgId, entry.collectionId);
  if (!collection) return null;

  const row = { updated_at: now() };
  if (patch.data !== undefined) {
    const data = normalizeEntryData({ ...entry.data, ...patch.data }, collection.fields);
    const missing = missingRequired(data, collection.fields);
    if (missing.length) throw new Error(`Missing required field(s): ${missing.join(', ')}`);
    row.data = data;
  }
  if (patch.slug !== undefined) {
    row.slug = await uniqueEntrySlug(orgId, entry.collectionId, slugify(patch.slug, entry.slug), entryId);
  }
  if (patch.status !== undefined) row.status = patch.status === 'draft' ? 'draft' : 'published';
  if (patch.sortOrder !== undefined) row.sort_order = Number(patch.sortOrder) || 0;

  const { error } = await db().from('collection_entries').update(row).eq('org_id', orgId).eq('id', entryId);
  throwOn('updateEntry', error);
  return { ...entry, ...rowToEntry({ ...found[0], ...row }) };
}

export async function removeEntry(orgId, entryId) {
  assertOrg(orgId, 'removeEntry');
  const { error } = await db().from('collection_entries').delete().eq('org_id', orgId).eq('id', entryId);
  throwOn('removeEntry', error);
  return true;
}

// Re-save every entry through the current field list, dropping keys for
// fields that no longer exist and filling in newly added ones.
async function renormalizeEntries(orgId, collectionId, fields) {
  const entries = await listEntries(orgId, collectionId);
  for (const entry of entries) {
    const next = normalizeEntryData(entry.data, fields);
    const { error } = await db().from('collection_entries')
      .update({ data: next, updated_at: now() })
      .eq('org_id', orgId).eq('id', entry.id);
    throwOn('renormalizeEntries', error);
  }
}

// Everything a page render needs in one shot: the collection plus its
// published entries, for hydrating collection-list blocks at serve time.
export async function listForRender(orgId, collectionSlugOrId) {
  const collection = (await getBySlug(orgId, collectionSlugOrId)) || (await get(orgId, collectionSlugOrId));
  if (!collection) return null;
  const entries = await listEntries(orgId, collection.id, { includeDrafts: false });
  return { collection, entries };
}
