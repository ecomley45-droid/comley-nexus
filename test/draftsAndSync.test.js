// Unpublished changes on a live page, and blocks synced to the library.
//
// Both touch what the public site serves, so the invariants worth defending
// are negative ones: a draft must never reach the public path, and a synced
// block must never leave a page blank when its library entry disappears.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editableView, applyEdit, publishDraft, discardDraft,
  hasPendingChanges, describePending, DRAFTABLE_FIELDS,
} from '../src/shared/pageDrafts.js';
import {
  resolveSectionHtml, isOrphanedSync, countSyncedUses, syncUsageMap,
} from '../src/shared/syncedBlocks.js';
import { compilePageHtml } from '../src/shared/compilePage.js';
import { sanitizePage } from '../lib/sanitize.js';

const live = (over = {}) => ({
  id: 'p', name: 'Home', slug: 'home', status: 'published',
  content: [{ id: 'a', html: '<p>live</p>' }],
  seo: { title: 'Live title' }, analytics: {}, layout: {}, ...over,
});

// ------------------------------------------------------------------- drafts

test('a content edit on a published page does not touch the live version', () => {
  const page = { ...live(), ...applyEdit(live(), { content: [{ id: 'a', html: '<p>edited</p>' }] }) };
  assert.equal(page.content[0].html, '<p>live</p>', 'visitors must keep seeing the published version');
  assert.equal(page.draft.content[0].html, '<p>edited</p>');
  assert.ok(hasPendingChanges(page));
});

test('the editor sees the draft, the compiler sees live', () => {
  const page = { ...live(), draft: { content: [{ id: 'a', html: '<p>edited</p>' }] } };
  assert.equal(editableView(page).content[0].html, '<p>edited</p>');

  const published = compilePageHtml(page, [page], [], {});
  assert.ok(published.includes('<p>live</p>'));
  assert.ok(!published.includes('<p>edited</p>'), 'the public path must never render a draft');
});

test('organisational fields apply immediately, content fields do not', () => {
  const page = { ...live(), ...applyEdit(live(), { name: 'Renamed', status: 'draft' }) };
  assert.equal(page.name, 'Renamed');
  assert.equal(page.status, 'draft');
  assert.ok(!page.draft, 'a rename should not be held hostage to a content publish');

  for (const field of DRAFTABLE_FIELDS) {
    const edited = applyEdit(live(), { [field]: 'x' });
    assert.ok(edited.draft && field in edited.draft, `${field} should be draftable`);
  }
});

test('a draft page edits directly, with no draft object', () => {
  const page = live({ status: 'draft' });
  const edited = { ...page, ...applyEdit(page, { content: [{ id: 'a', html: '<p>y</p>' }] }) };
  assert.equal(edited.content[0].html, '<p>y</p>');
  assert.ok(!edited.draft, 'an unpublished page is already a draft');
  assert.equal(hasPendingChanges(edited), false);
});

test('publishing promotes the draft and clears it', () => {
  const page = { ...live(), draft: { content: [{ id: 'a', html: '<p>edited</p>' }], seo: { title: 'New' } } };
  const after = { ...page, ...publishDraft(page) };
  assert.equal(after.content[0].html, '<p>edited</p>');
  assert.equal(after.seo.title, 'New');
  assert.equal(after.draft, undefined);
  assert.equal(after.status, 'published');
});

test('discarding leaves the live version exactly as it was', () => {
  const page = { ...live(), draft: { content: [{ id: 'a', html: '<p>edited</p>' }] } };
  const after = { ...page, ...discardDraft() };
  assert.equal(after.content[0].html, '<p>live</p>');
  assert.equal(after.draft, undefined);
});

test('the pending summary names what actually changed', () => {
  assert.equal(describePending(live()), '');
  const added = { ...live(), draft: { content: [{ id: 'a' }, { id: 'b' }] } };
  assert.ok(describePending(added).includes('1 block added'));
  const removed = { ...live({ content: [{ id: 'a' }, { id: 'b' }] }), draft: { content: [{ id: 'a' }] } };
  assert.ok(describePending(removed).includes('1 block removed'));
  assert.ok(describePending({ ...live(), draft: { seo: {} } }).includes('SEO'));
});

test('draft content is sanitised on write, not left dirty until publish', () => {
  const clean = sanitizePage({
    ...live(),
    draft: { content: [{ id: 'a', html: '<div onclick="steal()">draft</div>' }] },
  });
  assert.ok(!JSON.stringify(clean.draft).includes('onclick'));
  assert.ok(!('draft' in clean.draft), 'a draft cannot nest another draft');
});

// -------------------------------------------------------------- synced blocks

const LIBRARY = [{ id: 'lib-1', name: 'Footer CTA', html: '<div>CURRENT</div>' }];

test('a synced section renders the library entry, not its stored copy', () => {
  const section = { id: 's', libraryId: 'lib-1', html: '<div>STALE</div>' };
  assert.equal(resolveSectionHtml(section, LIBRARY), '<div>CURRENT</div>');
});

test('an unsynced section is untouched', () => {
  assert.equal(resolveSectionHtml({ id: 's', html: '<p>mine</p>' }, LIBRARY), '<p>mine</p>');
});

test('a deleted library entry falls back instead of blanking the page', () => {
  const orphan = { id: 's', libraryId: 'gone', html: '<div>LAST KNOWN</div>' };
  assert.equal(resolveSectionHtml(orphan, LIBRARY), '<div>LAST KNOWN</div>');
  assert.equal(isOrphanedSync(orphan, LIBRARY), true);
  assert.equal(isOrphanedSync({ id: 's', libraryId: 'lib-1' }, LIBRARY), false);
  assert.equal(isOrphanedSync({ id: 's' }, LIBRARY), false);
});

test('one library edit changes every page using it', () => {
  const page = {
    ...live(),
    content: [
      { id: 'a', libraryId: 'lib-1', html: '<div>STALE</div>' },
      { id: 'b', html: '<p>own</p>' },
    ],
  };
  const out = compilePageHtml(page, [page], LIBRARY, {});
  assert.ok(out.includes('CURRENT'));
  assert.ok(!out.includes('STALE'), 'this is the whole point — no page keeps an old copy');
  assert.ok(out.includes('<p>own</p>'), 'unsynced blocks are unaffected');
});

test('usage counts tell you what a library edit will affect', () => {
  const pages = [
    { content: [{ libraryId: 'lib-1' }, { libraryId: 'lib-1' }, {}] },
    { content: [{ libraryId: 'lib-1' }, { libraryId: 'lib-2' }] },
  ];
  assert.equal(countSyncedUses('lib-1', pages), 3);
  assert.equal(countSyncedUses('nope', pages), 0);
  assert.deepEqual(syncUsageMap(pages), { 'lib-1': 3, 'lib-2': 1 });
});

test('drafts and syncing compose without interfering', () => {
  const page = {
    ...live(),
    content: [{ id: 'a', libraryId: 'lib-1', html: '<div>STALE</div>' }],
    draft: { content: [{ id: 'a', libraryId: 'lib-1', html: '<div>STALE</div>' }, { id: 'b', html: '<p>new</p>' }] },
  };
  const published = compilePageHtml(page, [page], LIBRARY, {});
  assert.ok(published.includes('CURRENT'), 'the live version still follows the library');
  assert.ok(!published.includes('<p>new</p>'), 'the draft block stays unpublished');

  const preview = compilePageHtml(editableView(page), [page], LIBRARY, {});
  assert.ok(preview.includes('<p>new</p>'));
  assert.ok(preview.includes('CURRENT'));
});
