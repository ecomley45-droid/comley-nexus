// validateSitePayload is the gate every template write passes through, and
// materializeInstall is what a workspace actually receives. Between them they
// decide what an untrusted or AI-authored template can put into someone's
// site, so the allowlist and the install shape both get pinned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSitePayload, materializeInstall, summarizePayload, cleanTheme, INSTALLABLE_BLOCK_TYPES,
} from '../lib/sitePayload.js';

const sections = (over = []) => [{ name: 'Hero', blockType: 'hero', fields: { headings: ['Hi'] } }, ...over];

test('script and layout can never arrive via a template', () => {
  assert.ok(!INSTALLABLE_BLOCK_TYPES.includes('script'), 'arbitrary JS must not be installable');
  assert.ok(!INSTALLABLE_BLOCK_TYPES.includes('layout'));
  const { pages } = validateSitePayload({
    pages: [{ name: 'H', slug: 'index', sections: [
      { name: 'evil', blockType: 'script', fields: { code: 'steal()' } },
      ...sections(),
    ] }],
  });
  assert.deepEqual(pages[0].sections.map((s) => s.blockType), ['hero']);
});

test('unknown block types are dropped, not passed through', () => {
  const { pages } = validateSitePayload({
    pages: [{ name: 'H', slug: 'index', sections: [{ name: 'x', blockType: 'not-a-block', fields: {} }, ...sections()] }],
  });
  assert.equal(pages[0].sections.length, 1);
});

test('slugs are normalised, deduped, and an index page is guaranteed', () => {
  const { pages } = validateSitePayload({
    pages: [
      { name: 'About Us!', slug: 'About Us!', sections: sections() },
      { name: 'Dupe', slug: 'about-us', sections: sections() },
    ],
  });
  assert.equal(pages.length, 1, 'a colliding slug is dropped rather than overwriting');
  assert.equal(pages[0].slug, 'index', 'the router assumes an index page exists');
});

test('themes keep only valid hex and known font keys', () => {
  const theme = cleanTheme({
    primary: '#6366f1', secondary: 'rebeccapurple', bg: '#fff</style><script>x</script>',
    fontFamily: 'system', fontScale: 'nope',
  });
  assert.deepEqual(theme, { primary: '#6366f1', fontFamily: 'system' });
});

test('malformed pages are skipped without taking the payload down', () => {
  const { pages } = validateSitePayload({
    pages: [null, 'nope', { name: 'No slug' }, { name: 'OK', slug: 'index', sections: sections() }],
  });
  assert.equal(pages.length, 1);
  assert.deepEqual(validateSitePayload(null), { theme: {}, pages: [] });
  assert.deepEqual(validateSitePayload({ pages: 'nope' }), { theme: {}, pages: [] });
});

test('install renders html from fields and never trusts stored html', () => {
  const { pages } = materializeInstall({ pages: [{ name: 'H', slug: 'index', sections: [
    { name: 'Hero', blockType: 'hero', fields: { headings: ['Live'] }, html: '<div>STALE</div>' },
  ] }] }, { stamp: 1 });
  assert.ok(pages[0].content[0].html.includes('Live'));
  assert.ok(!pages[0].content[0].html.includes('STALE'), 'html is always regenerated from fields');
});

const DOC = `<!doctype html><html><head><style>.a{}</style></head><body><div id="root">
  <header><h1>Acme</h1><nav><a href="/">Home</a><a href="/x">X</a></nav></header>
  <section><h2>Pricing</h2><p>Simple plans.</p></section>
  <footer><p>© Acme</p><a href="/a">A</a><a href="/b">B</a></footer>
</div></body></html>`;

test('a full-HTML template page installs as typed, editable blocks', () => {
  const { pages } = materializeInstall({ pages: [{ name: 'Home', slug: 'index', editorMode: 'full-html', fullHtml: DOC }] }, { stamp: 1 });
  const page = pages[0];
  assert.equal(page.editorMode, 'blocks', 'a template must never install as a locked page');
  assert.ok(page.content.length > 0);
  for (const s of page.content) {
    assert.ok(s.blockType, `"${s.name}" arrived as raw HTML instead of a typed block`);
    assert.ok(s.html, `"${s.name}" rendered empty`);
  }
});

test('the original document is preserved so Convert can restore the design', () => {
  const { pages } = materializeInstall({ pages: [{ name: 'Home', slug: 'index', editorMode: 'full-html', fullHtml: DOC }] }, { stamp: 1 });
  assert.equal(pages[0].fullHtml, DOC, 'losing the source would make the re-skin irreversible');
  assert.equal(pages[0].layout.useGlobalHeader, false, 'the document has its own header; adding the global one would double it');
});

test('installed pages carry ids unique within the batch', () => {
  const { pages } = materializeInstall({ pages: [
    { name: 'A', slug: 'index', sections: sections(sections()) },
    { name: 'B', slug: 'b', sections: sections() },
  ] }, { stamp: 1 });
  const ids = pages.flatMap((p) => [p.id, ...p.content.map((s) => s.id)]);
  assert.equal(new Set(ids).size, ids.length);
});

test('summary counts the blocks a full-HTML page will become', () => {
  const summary = summarizePayload(validateSitePayload({ pages: [{ name: 'H', slug: 'index', editorMode: 'full-html', fullHtml: DOC }] }));
  assert.equal(summary.pageCount, 1);
  assert.equal(summary.fullHtmlPages, 1);
  assert.ok(summary.sectionCount > 0, 'reporting zero sections would misrepresent the template');
});
