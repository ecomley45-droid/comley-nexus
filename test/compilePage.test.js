// The page compiler is the single most load-bearing pure function in the
// system: every published page, every preview, and the static export all go
// through it. These lock in the behaviours that are easy to break by
// accident — mode forking, header/footer precedence, escaping, and the
// "untouched pages compile exactly as before" guarantee that the design
// tokens depend on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePageHtml, getFullPath, resolveGlobalContent, pickWeightedVariant } from '../src/shared/compilePage.js';

const page = (over = {}) => ({
  id: 'p1', name: 'Home', slug: 'index', parentId: null,
  content: [], seo: {}, analytics: {}, layout: {}, ...over,
});

test('full-code pages bypass the compiler entirely', () => {
  const p = page({ editorMode: 'full-html', fullHtml: '<!doctype html><html><body>raw</body></html>' });
  const out = compilePageHtml(p, [p], [], { theme: { bg: '#fff' }, analytics: { headSnippet: '<script></script>' } });
  assert.equal(out, p.fullHtml);
  assert.ok(!out.includes('--color-bg'), 'theme must not be injected into a full-code page');
});

test('sections render inside their data-section-id wrapper', () => {
  const p = page({ content: [{ id: 'sec-a', html: '<p>hello</p>' }] });
  const out = compilePageHtml(p, [p], [], {});
  assert.ok(out.includes('<section data-section-id="sec-a"><p>hello</p></section>'));
});

test('a page with no design tokens emits no section stylesheet', () => {
  const p = page({ content: [{ id: 'sec-a', html: '<p>x</p>' }] });
  const out = compilePageHtml(p, [p], [], {});
  assert.ok(!out.includes('[data-section-id='), 'untouched pages must compile as they did before design tokens existed');
});

test('design tokens compile into a scoped stylesheet in the head', () => {
  const p = page({ content: [{ id: 'sec-a', html: '<p>x</p>', style: { padding: { top: 64 }, bgColor: '#111' } }] });
  const out = compilePageHtml(p, [p], [], {});
  assert.ok(out.includes('[data-section-id="sec-a"]{'));
  assert.ok(out.includes('padding-top:64px'));
  assert.ok(out.indexOf('[data-section-id="sec-a"]') < out.indexOf('<body>'), 'section CSS belongs in the head');
});

test('site-wide custom CSS wins over generated section CSS', () => {
  const p = page({ content: [{ id: 'sec-a', html: '<p>x</p>', style: { bgColor: '#111' } }] });
  const out = compilePageHtml(p, [p], [], { theme: { customCss: '.x{color:red}' } });
  assert.ok(out.indexOf('[data-section-id="sec-a"]') < out.indexOf('.x{color:red}'),
    'theme.customCss must come last so a workspace can always override a block');
});

test('titles and descriptions are HTML-escaped', () => {
  const p = page({ name: 'Tom & "Jerry" <hi>', seo: { description: 'a < b' } });
  const out = compilePageHtml(p, [p], [], {});
  assert.ok(out.includes('<title>Tom &amp; &quot;Jerry&quot; &lt;hi&gt;</title>'));
  assert.ok(out.includes('content="a &lt; b"'));
  assert.ok(!out.includes('<hi>'));
});

test('canonical and og:url appear only when an origin is known', () => {
  const p = page({ slug: 'about' });
  assert.ok(!compilePageHtml(p, [p], [], {}).includes('rel="canonical"'), 'previews must not declare a canonical');
  const served = compilePageHtml(p, [p], [], {}, {}, 'https://acme.com');
  assert.ok(served.includes('<link rel="canonical" href="https://acme.com/about" />'));
});

test('getFullPath walks parents, skips index, and survives a cycle', () => {
  const root = { id: 'a', slug: 'about', parentId: null };
  const child = { id: 'b', slug: 'team', parentId: 'a' };
  const home = { id: 'c', slug: 'index', parentId: null };
  assert.equal(getFullPath(child, [root, child, home]), 'about/team');
  assert.equal(getFullPath(home, [home]), '');

  const x = { id: 'x', slug: 'x', parentId: 'y' };
  const y = { id: 'y', slug: 'y', parentId: 'x' };
  assert.equal(getFullPath(x, [x, y]), 'y/x', 'a cyclic parentId must terminate, not hang');
});

test('header/footer precedence: override > global > off', () => {
  const globals = { globals: { header: { html: '<h1>G</h1>' }, footer: { html: '<p>G</p>' } } };
  assert.equal(resolveGlobalContent(page(), globals).headerHtml, '<h1>G</h1>');
  assert.equal(resolveGlobalContent(page({ layout: { useGlobalHeader: false } }), globals).headerHtml, '');
  assert.equal(
    resolveGlobalContent(page({ layout: { headerOverride: '<h1>Mine</h1>' } }), globals).headerHtml,
    '<h1>Mine</h1>',
    'an override beats the global even while inheritance is on'
  );
  assert.equal(
    resolveGlobalContent(page({ layout: { headerOverride: '   ' } }), globals).headerHtml,
    '<h1>G</h1>',
    'a whitespace-only override is not an override'
  );
});

test('A/B: the chosen variant renders, and an unknown choice falls back', () => {
  const p = page({
    content: [{
      id: 'sec-a', html: '<p>base</p>',
      abVariants: [{ id: 'v1', html: '<p>one</p>' }, { id: 'v2', html: '<p>two</p>' }],
    }],
  });
  assert.ok(compilePageHtml(p, [p], [], {}, { 'sec-a': 'v2' }).includes('<p>two</p>'));
  assert.ok(compilePageHtml(p, [p], [], {}, { 'sec-a': 'nope' }).includes('<p>one</p>'));
});

test('pickWeightedVariant always returns a variant and respects weight 0', () => {
  const variants = [{ id: 'a', weight: 0 }, { id: 'b', weight: 5 }];
  for (let i = 0; i < 50; i += 1) {
    assert.equal(pickWeightedVariant(variants).id, 'b', 'a zero-weight variant must never be picked');
  }
  assert.ok(pickWeightedVariant([{ id: 'solo' }]).id === 'solo');
});
