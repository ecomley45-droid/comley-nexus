// The marketplace seeds itself from SITE_TEMPLATES so the two can't drift.
// It used to seed only into an empty table, which quietly turned that promise
// into "whatever the array held the first time anyone looked" — every
// template added later needed hand-written SQL to appear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDbClientForTests } from '../lib/db.js';
import { list, fingerprint } from '../lib/siteTemplateStore.js';
import { defaultMarketplaceTemplates } from '../lib/sitePayload.js';

// Stand-in for the slice of the query builder this store uses.
function fakeDb(rows) {
  const table = { rows: [...rows], inserts: [], updates: [] };
  const client = {
    from() {
      const f = [];
      const q = {
        select() { return q; },
        eq(col, val) { f.push((r) => r[col] === val); return q; },
        is(col, val) { f.push((r) => (r[col] ?? null) === val); return q; },
        or() { return q; },
        order() { return q; },
        upsert(next, opts) {
          for (const row of next) {
            const i = table.rows.findIndex((r) => r.id === row.id);
            if (i === -1) { table.rows.push(row); table.inserts.push(row.id); continue; }
            if (opts?.ignoreDuplicates) continue;
            table.rows[i] = { ...table.rows[i], ...row };
            table.updates.push(row.id);
          }
          return Promise.resolve({ error: null });
        },
        then(resolve) {
          return Promise.resolve(resolve({ data: table.rows.filter((r) => f.every((fn) => fn(r))), error: null }));
        },
      };
      return q;
    },
  };
  return { table, client };
}

const platformRow = (t) => ({
  id: t.id, org_id: null, slug: t.slug, name: t.name, category: t.category,
  description: t.description, feature_list: t.featureList, payload: t.payload,
  sort_order: t.sortOrder, is_active: true,
});

test('an empty table gets every platform template', async (t) => {
  const defaults = defaultMarketplaceTemplates();
  const { table, client } = fakeDb([]);
  setDbClientForTests(client);
  t.after(() => setDbClientForTests(null));

  const out = await list(null);
  assert.equal(table.inserts.length, defaults.length);
  assert.equal(out.length, defaults.length);
  assert.ok(out.some((r) => r.slug === 'realtor'));
});

test('a template added to the array after seeding still reaches the marketplace', async (t) => {
  // The real-world shape of the bug: the table was seeded before `realtor`
  // existed, so a count-based guard would have declared it done forever.
  const defaults = defaultMarketplaceTemplates();
  const older = defaults.filter((d) => d.slug !== 'realtor');
  assert.ok(older.length > 0 && older.length < defaults.length, 'fixture assumes realtor is one of several');

  const { table, client } = fakeDb(older.map(platformRow));
  setDbClientForTests(client);
  t.after(() => setDbClientForTests(null));

  const out = await list(null);
  assert.deepEqual(table.inserts, [defaults.find((d) => d.slug === 'realtor').id],
    'only the missing one is inserted');
  assert.ok(out.some((r) => r.slug === 'realtor'));
});

// Seed the table the way a previous run would have, fingerprints and all.
async function seeded(t) {
  const { table, client } = fakeDb([]);
  setDbClientForTests(client);
  t.after(() => setDbClientForTests(null));
  await list(null);
  table.inserts.length = 0;
  table.updates.length = 0;
  return table;
}

test('a second read writes nothing when nothing has changed', async (t) => {
  const table = await seeded(t);
  await list(null);
  assert.deepEqual(table.inserts, []);
  assert.deepEqual(table.updates, [], 'every page load rewriting every row would be pure churn');
  assert.ok(table.rows.every((r) => r.seed_hash), 'each seeded row records what was written');
});

test('a template that CHANGED in code refreshes on the next read', async (t) => {
  // The bug this exists for: the realtor template was repaletted and given
  // new pages after its row was first written, and every workspace kept
  // installing the old one because seeding only ever inserted.
  const table = await seeded(t);
  const row = table.rows.find((r) => r.slug === 'realtor');
  const stale = JSON.parse(JSON.stringify(row.payload));
  stale.theme.accent = '#000000';
  stale.pages = stale.pages.slice(0, 2);
  Object.assign(row, { payload: stale, name: 'Realtor (old)' });
  // The row is stale, not edited: its fingerprint matches its own content,
  // because that content is exactly what an older build seeded.
  row.seed_hash = fingerprint(row);

  await list(null);
  const after = table.rows.find((r) => r.slug === 'realtor');
  assert.equal(after.payload.theme.accent, '#CE011F', 'the current palette should win');
  assert.ok(after.payload.pages.length > 2, 'and the current page set');
  assert.deepEqual(table.updates, [after.id]);
});

test('a row a super-admin edited is left exactly alone', async (t) => {
  const table = await seeded(t);
  const row = table.rows.find((r) => r.slug === 'realtor');
  // An edit through PATCH /api/templates/:id changes content without
  // touching seed_hash, so the fingerprints no longer agree.
  row.name = 'Renamed by an admin';
  row.payload = { ...row.payload, theme: { ...row.payload.theme, accent: '#00FF00' } };

  await list(null);
  const after = table.rows.find((r) => r.slug === 'realtor');
  assert.equal(after.name, 'Renamed by an admin', 'their work is not ours to overwrite');
  assert.equal(after.payload.theme.accent, '#00FF00');
  assert.deepEqual(table.updates, []);
});

test('deactivating survives a refresh, so it stays the way to hide a template', async (t) => {
  const table = await seeded(t);
  const row = table.rows.find((r) => r.slug === 'realtor');
  // Stale (so it WILL be refreshed) but unedited, and switched off.
  row.payload = { pages: [], theme: {} };
  row.seed_hash = fingerprint(row);
  row.is_active = false;

  const out = await list(null);
  assert.deepEqual(table.updates, [row.id], 'the row was refreshed…');
  const after = table.rows.find((r) => r.slug === 'realtor');
  assert.ok(after.payload.pages.length > 0, '…with current content…');
  assert.equal(after.is_active, false, '…and is_active is not code’s to reset');
  assert.ok(!out.some((r) => r.slug === 'realtor'), 'so it stays out of the marketplace');
});
