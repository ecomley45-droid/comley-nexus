// The page save path used to be last-write-wins over the whole pages array:
// two editors, or one stale tab, and someone's work vanished — including
// entire pages, because deletions were computed against "everything in the
// org". These exercise storage.pages against a fake Supabase client, so the
// guards are covered without needing a database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pages as pagesStore } from '../lib/storage.js';
import { db, setDbClientForTests } from '../lib/db.js';

// Minimal stand-in for the query builder surface storage.js actually uses.
function fakeDb(rows) {
  const table = { rows: [...rows], deleted: [] };
  const builder = () => {
    const q = { _filters: [], _in: null, _notIn: null, _select: null };
    const thenable = {
      select(cols) { q._select = cols; return thenable; },
      eq() { return thenable; },
      in(col, vals) { q._in = vals; return thenable; },
      not(col, op, vals) { q._notIn = vals; return thenable; },
      order() { return thenable; },
      upsert(next) {
        for (const row of next) {
          const i = table.rows.findIndex((r) => r.id === row.id);
          if (i === -1) table.rows.push(row); else table.rows[i] = { ...table.rows[i], ...row };
        }
        return Promise.resolve({ error: null });
      },
      delete() {
        q._isDelete = true;
        return {
          eq() { return this; },
          in(col, vals) {
            table.deleted.push(...vals);
            table.rows = table.rows.filter((r) => !vals.includes(r.id));
            return Promise.resolve({ error: null });
          },
          not(col, op, vals) {
            const keep = String(vals).replace(/[()"]/g, '').split(',');
            const dropped = table.rows.filter((r) => !keep.includes(r.id)).map((r) => r.id);
            table.deleted.push(...dropped);
            table.rows = table.rows.filter((r) => keep.includes(r.id));
            return Promise.resolve({ error: null });
          },
          then(resolve) {
            table.deleted.push(...table.rows.map((r) => r.id));
            table.rows = [];
            return Promise.resolve(resolve({ error: null }));
          },
        };
      },
      then(resolve) {
        let data = table.rows;
        if (q._in) data = data.filter((r) => q._in.includes(r.id));
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return thenable;
  };
  return { table, client: { from: builder } };
}

const row = (id, updatedAt, extra = {}) => ({
  id, org_id: 'org1', name: id, slug: id, parent_id: null, content: [], seo: {},
  status: 'draft', scheduled_publish_at: null, analytics: {}, layout: {},
  updated_at: updatedAt, ...extra,
});

const T0 = '2026-01-01T10:00:00.000Z';
const T1 = '2026-01-01T11:00:00.000Z';

test('list exposes the concurrency token', async () => {
  const { client } = fakeDb([row('a', T0)]);
  setDbClientForTests(client);
  const out = await pagesStore.list('org1');
  assert.equal(out[0].updatedAt, T0);
  setDbClientForTests(null);
});

test('a stale save is reported as a conflict', async () => {
  const { client } = fakeDb([row('a', T1)]);
  setDbClientForTests(client);
  const conflicts = await pagesStore.detectConflicts('org1', [{ id: 'a', name: 'a', updatedAt: T0 }]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].id, 'a');
  assert.equal(conflicts[0].theirs, T1);
  setDbClientForTests(null);
});

test('an up-to-date save is not a conflict', async () => {
  const { client } = fakeDb([row('a', T0)]);
  setDbClientForTests(client);
  assert.deepEqual(await pagesStore.detectConflicts('org1', [{ id: 'a', updatedAt: T0 }]), []);
  setDbClientForTests(null);
});

test('a brand-new page has nothing to conflict with', async () => {
  const { client } = fakeDb([row('a', T1)]);
  setDbClientForTests(client);
  assert.deepEqual(await pagesStore.detectConflicts('org1', [{ id: 'new', name: 'New' }]), []);
  setDbClientForTests(null);
});

test('deletions are scoped to what the client had loaded', async () => {
  // The client loaded only "a". Meanwhile another tab created "b".
  const { table, client } = fakeDb([row('a', T0), row('b', T1)]);
  setDbClientForTests(client);
  await pagesStore.bulkReplace('org1', [{ id: 'a', name: 'a', slug: 'a' }], { knownIds: ['a'] });
  assert.ok(table.rows.some((r) => r.id === 'b'), "a page this client never saw must not be deleted by its save");
  assert.deepEqual(table.deleted, []);
  setDbClientForTests(null);
});

test('a page the client did load and then removed is deleted', async () => {
  const { table, client } = fakeDb([row('a', T0), row('b', T0)]);
  setDbClientForTests(client);
  await pagesStore.bulkReplace('org1', [{ id: 'a', name: 'a', slug: 'a' }], { knownIds: ['a', 'b'] });
  assert.deepEqual(table.deleted, ['b']);
  assert.ok(!table.rows.some((r) => r.id === 'b'));
  setDbClientForTests(null);
});
