// The marketplace seeds itself from SITE_TEMPLATES so the two can't drift.
// It used to seed only into an empty table, which quietly turned that promise
// into "whatever the array held the first time anyone looked" — every
// template added later needed hand-written SQL to appear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDbClientForTests } from '../lib/db.js';
import { list } from '../lib/siteTemplateStore.js';
import { defaultMarketplaceTemplates } from '../lib/sitePayload.js';

// Stand-in for the slice of the query builder this store uses.
function fakeDb(rows) {
  const table = { rows: [...rows], inserts: [] };
  const client = {
    from() {
      const f = [];
      const q = {
        select() { return q; },
        eq(col, val) { f.push((r) => r[col] === val); return q; },
        is(col, val) { f.push((r) => (r[col] ?? null) === val); return q; },
        or() { return q; },
        order() { return q; },
        upsert(next) {
          for (const row of next) {
            if (table.rows.some((r) => r.id === row.id)) continue;   // ignoreDuplicates
            table.rows.push(row);
            table.inserts.push(row.id);
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

test('seeding never rewrites a row an admin has edited', async (t) => {
  const defaults = defaultMarketplaceTemplates();
  const edited = defaults.map(platformRow);
  edited[0].name = 'Renamed by an admin';
  edited[0].is_active = false;

  const { table, client } = fakeDb(edited);
  setDbClientForTests(client);
  t.after(() => setDbClientForTests(null));

  const out = await list(null);
  assert.deepEqual(table.inserts, [], 'nothing was missing, so nothing was written');
  assert.equal(table.rows[0].name, 'Renamed by an admin');
  assert.ok(!out.some((r) => r.id === edited[0].id), 'deactivating is how a platform template is hidden');
});
