// Converting between no-code and full-code is the one operation that could
// quietly take a live page down, because it involves a published page and a
// duplicate. The invariant worth defending is that it never touches the
// source page and never produces something already public.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConvertedPage, htmlToSections, modeOf, otherMode, PAGE_MODES } from '../src/cms/lib/pageModes.js';
import { blankPage } from '../src/cms/lib/pageActions.js';

const livePage = (over = {}) => ({
  id: 'p1', name: 'Home', slug: 'home', parentId: null, status: 'published',
  editorMode: 'blocks', fullHtml: '', content: [{ id: 's1', html: '<p>hi</p>' }],
  seo: {}, analytics: {}, layout: {}, ...over,
});

test('mode helpers treat anything not full-html as blocks', () => {
  assert.equal(modeOf({ editorMode: 'full-html' }), 'full-html');
  assert.equal(modeOf({ editorMode: 'blocks' }), 'blocks');
  assert.equal(modeOf({}), 'blocks');
  assert.equal(modeOf(undefined), 'blocks');
  assert.equal(otherMode('blocks'), 'full-html');
  assert.ok(PAGE_MODES['full-html'].label && PAGE_MODES.blocks.label);
});

test('converting never mutates or unpublishes the source page', () => {
  const source = livePage();
  const before = JSON.stringify(source);
  const copy = buildConvertedPage(source, [source], 'full-html', { globalSettings: {} });
  assert.equal(JSON.stringify(source), before, 'the live page must be left exactly as it was');
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.status, 'draft', 'a converted copy must never arrive published');
  assert.equal(copy.scheduledPublishAt, null, "and must not inherit the source's publish schedule");
});

test('converting to full-code snapshots what the page renders today', () => {
  const source = livePage();
  const copy = buildConvertedPage(source, [source], 'full-html', { globalSettings: { theme: {} } });
  assert.equal(copy.editorMode, 'full-html');
  assert.ok(copy.fullHtml.startsWith('<!doctype html>'));
  assert.ok(copy.fullHtml.includes('<p>hi</p>'));
});

test('converting to no-code splits the document and drops global chrome', () => {
  const doc = '<html><head><style>a{}</style></head><body><header><h1>H</h1></header><section><h2>S</h2></section></body></html>';
  const source = livePage({ editorMode: 'full-html', fullHtml: doc, content: [] });
  const copy = buildConvertedPage(source, [source], 'blocks', {});
  assert.equal(copy.editorMode, 'blocks');
  assert.ok(copy.content.length >= 2);
  assert.equal(copy.layout.useGlobalHeader, false, 'the document has its own header already');
  assert.equal(copy.layout.useGlobalFooter, false);
});

test('a converted copy never inherits running experiments', () => {
  const source = livePage({ content: [{ id: 's1', html: '<p>a</p>', abVariants: [{ id: 'v1', html: '<p>b</p>' }] }] });
  const copy = buildConvertedPage(source, [source], 'blocks', {});
  assert.ok(copy.content.every((s) => !s.abVariants), 'variant stats belong to the original page');
});

test('slugs stay unique among siblings', () => {
  const source = livePage();
  const taken = { ...livePage(), id: 'other', slug: 'home-full-code' };
  assert.equal(buildConvertedPage(source, [source], 'full-html', {}).slug, 'home-full-code');
  assert.equal(buildConvertedPage(source, [source, taken], 'full-html', {}).slug, 'home-full-code-2');
});

test('a page in a different branch does not block a slug', () => {
  const source = livePage();
  const elsewhere = { ...livePage(), id: 'x', parentId: 'somewhere-else', slug: 'home-full-code' };
  assert.equal(buildConvertedPage(source, [source, elsewhere], 'full-html', {}).slug, 'home-full-code',
    'slug uniqueness is per parent, matching getFullPath');
});

test('htmlToSections runs without a DOM and produces unique ids', () => {
  const sections = htmlToSections('<html><body><header><h1>A</h1></header><section><h2>B</h2></section></body></html>');
  assert.ok(sections.length >= 2);
  assert.equal(new Set(sections.map((s) => s.id)).size, sections.length);
  assert.deepEqual(htmlToSections(''), []);
});

test('blankPage defaults to no-code and seeds a valid coded skeleton', () => {
  const blocks = blankPage();
  assert.equal(blocks.editorMode, 'blocks');
  assert.equal(blocks.fullHtml, '');
  assert.equal(blocks.status, 'draft');

  const coded = blankPage('full-html');
  assert.equal(coded.editorMode, 'full-html');
  assert.ok(coded.fullHtml.startsWith('<!doctype html>'), 'an empty textarea gives no clue what shape is expected');
});
