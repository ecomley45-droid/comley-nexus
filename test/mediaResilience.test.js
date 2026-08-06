// Media must not 500 the whole library just because migration 037's
// responsive-image columns aren't there yet — a deploy ahead of its migration
// is the exact case the storage.js header warns about. Reads fall back to the
// pre-037 shape and self-correct.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mediaCols, mediaHasVariants, markVariantsMissing, isMissingVariantColumn, _resetMediaColumnState,
} from '../lib/mediaColumns.js';
import { setDbClientForTests } from '../lib/db.js';
import { media } from '../lib/storage.js';
import { readFileSync } from 'node:fs';

test('an undefined-column error is recognised, a normal one is not', () => {
  assert.ok(isMissingVariantColumn({ code: '42703' }));
  assert.ok(isMissingVariantColumn({ message: 'column media.variants does not exist' }));
  assert.ok(isMissingVariantColumn({ message: "Could not find the 'width' column of 'media' in the schema cache" }));
  assert.ok(!isMissingVariantColumn({ code: '23505', message: 'duplicate key' }));
  assert.ok(!isMissingVariantColumn(null));
});

test('the selected columns drop the 037 set once it is known missing', () => {
  _resetMediaColumnState();
  assert.ok(mediaCols('media').includes('variants'), 'optimistic by default');
  markVariantsMissing('media');
  assert.ok(!mediaCols('media').includes('variants'), 'and drops them after a miss');
  assert.ok(mediaCols('nexus_media').includes('variants'), 'per-table — the other is unaffected');
  _resetMediaColumnState();
});

// A fake Supabase query builder that errors 42703 the first time the select
// asks for `variants`, and returns rows once it doesn't — i.e. a table that
// predates migration 037.
function preMigrationDb(rows) {
  const calls = [];
  const client = {
    from() {
      let cols = '';
      const q = {
        select(c) { cols = c; return q; },
        eq() { return q; },
        order() { return q; },
        insert(row) { calls.push({ op: 'insert', row }); return Promise.resolve(cols || row.variants !== undefined ? { error: null } : { error: null }); },
        then(resolve) {
          calls.push({ op: 'select', cols });
          if (/variants/.test(cols)) {
            return Promise.resolve(resolve({ data: null, error: { code: '42703', message: 'column media.variants does not exist' } }));
          }
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };
      return q;
    },
  };
  return { client, calls };
}

test('media.list falls back to the base columns and still returns rows', async (t) => {
  _resetMediaColumnState();
  const rows = [{ id: 'm1', name: 'photo', filename: 'f', mime_type: 'image/webp', size: 10, url: 'u', alt_text: '', description: '', uploaded_at: '2026-01-01T00:00:00Z' }];
  const { client, calls } = preMigrationDb(rows);
  setDbClientForTests(client);
  t.after(() => { setDbClientForTests(null); _resetMediaColumnState(); });

  const out = await media.list('org1');
  assert.equal(out.length, 1, 'the library still loads instead of 500ing');
  assert.deepEqual(out[0].variants, [], 'no variants without the column');
  assert.equal(out[0].width, null);
  // First attempt asked for variants and failed; the retry did not.
  const selects = calls.filter((c) => c.op === 'select');
  assert.ok(/variants/.test(selects[0].cols), 'first attempt is optimistic');
  assert.ok(!/variants/.test(selects[1].cols), 'retry uses the pre-037 shape');
});

test('once the columns are known missing, later reads skip the doomed attempt', async (t) => {
  _resetMediaColumnState();
  markVariantsMissing('media');
  const { client, calls } = preMigrationDb([]);
  setDbClientForTests(client);
  t.after(() => { setDbClientForTests(null); _resetMediaColumnState(); });

  await media.list('org1');
  const selects = calls.filter((c) => c.op === 'select');
  assert.equal(selects.length, 1, 'no wasted round-trip once we know');
  assert.ok(!/variants/.test(selects[0].cols));
});

// Regression guard for the second bug: the workspace-invite route used
// clerkClient without importing it, so every invite failed with
// "clerkClient is not defined" after the membership row was already written.
test('the team route imports the Clerk client it calls', () => {
  const src = readFileSync(new URL('../lib/routes/team.js', import.meta.url), 'utf8');
  assert.ok(/clerkClient\.invitations\.createInvitation/.test(src), 'it does invite via clerkClient');
  assert.ok(/import\s*\{[^}]*\bclerkClient\b[^}]*\}\s*from\s*['"]@clerk\/express['"]/.test(src),
    'so it must import clerkClient — without this every invite throws ReferenceError');
});
