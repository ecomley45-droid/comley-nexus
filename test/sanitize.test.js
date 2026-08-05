// The sanitizer is the trust boundary between authenticated editors and
// every published page. These pin the decisions that are deliberate (inline
// <style> allowed, forms restricted to same-origin) so a future config tweak
// can't quietly widen them, and prove the admin-gate detectors see through
// nesting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeContentHtml, sanitizeFullPageHtml, sanitizeAnalyticsHtml, sanitizeCss,
  sanitizePage, sanitizeGlobalSettings, pagesContainScriptBlock, pagesContainFullHtmlMode,
} from '../lib/sanitize.js';

test('content: event handlers and javascript: URLs are neutralised', () => {
  assert.ok(!sanitizeContentHtml('<div onclick="steal()">x</div>').includes('onclick'));
  assert.ok(!sanitizeContentHtml('<img src=x onerror="steal()">').includes('onerror'));
  // The scheme allowlist drops the href before CONTENT_CONFIG's `a`
  // transform (which rewrites to about:blank) ever runs, so the attribute
  // disappears entirely. That transform is a second fence for the day
  // someone widens allowedSchemes — what matters here is that no form of
  // javascript: reaches the page.
  for (const href of ['javascript:steal()', '  JavaScript:steal()', 'JAVASCRIPT:steal()']) {
    const out = sanitizeContentHtml(`<a href="${href}">x</a>`);
    assert.ok(!/javascript:/i.test(out), `javascript: survived as ${href}`);
  }
  assert.ok(sanitizeContentHtml('<a href="https://ok.test">x</a>').includes('https://ok.test'));
});

test('content: inline <style> survives — blocks depend on it', () => {
  const out = sanitizeContentHtml('<style>.nx-item{color:red}</style><div class="nx-item">x</div>');
  assert.ok(out.includes('.nx-item{color:red}'), 'stripping <style> would silently erase every block’s design');
});

test('content: forms may only post same-origin', () => {
  assert.ok(sanitizeContentHtml('<form action="/api/public/forms"></form>').includes('action="/api/public/forms"'));
  assert.ok(!sanitizeContentHtml('<form action="https://evil.test/x"></form>').includes('evil.test'));
});

test('content: iframes and scripts cannot smuggle a document via data:', () => {
  assert.ok(!sanitizeContentHtml('<iframe src="data:text/html,<script>x</script>"></iframe>').includes('data:text/html'));
  assert.ok(sanitizeContentHtml('<iframe src="https://www.youtube.com/embed/x"></iframe>').includes('youtube.com'));
});

test('content: document-skeleton tags are not allowed', () => {
  const out = sanitizeContentHtml('<html><head><title>t</title></head><body><p>hi</p></body></html>');
  assert.ok(!out.includes('<title>'));
  assert.ok(out.includes('<p>hi</p>'), 'the actual content still survives');
});

test('full-page: skeleton allowed, but no meta-refresh', () => {
  const out = sanitizeFullPageHtml('<html><head><title>t</title><meta http-equiv="refresh" content="0;url=https://evil.test"></head><body>x</body></html>');
  assert.ok(out.includes('<title>t</title>'));
  assert.ok(!out.includes('http-equiv'), 'meta-refresh is a redirect primitive and stays blocked');
});

test('analytics: keeps inline script bodies, drops everything else', () => {
  const out = sanitizeAnalyticsHtml('<p>copy</p><script>window.ga=1</script>');
  assert.ok(out.includes('window.ga=1'));
  assert.ok(!out.includes('<p>'));
});

test('css: a </style> breakout is impossible', () => {
  assert.ok(!sanitizeCss('body{}</style><script>steal()</script>').includes('<script>'));
  assert.equal(sanitizeCss('.a > .b { color: red }'), '.a > .b { color: red }', 'child selectors are untouched');
});

test('sanitizePage cleans every html-bearing field, including variants', () => {
  const clean = sanitizePage({
    id: 'p', name: 'n',
    content: [{ id: 's', html: '<div onclick="x">a</div>', abVariants: [{ id: 'v', html: '<div onclick="y">b</div>' }] }],
    layout: { headerOverride: '<div onclick="z">h</div>', footerOverride: '' },
    analytics: { headSnippet: '<p>no</p><script>ok()</script>', bodySnippet: '' },
    fullHtml: '<html><body onclick="w">x</body></html>',
  });
  assert.ok(!clean.content[0].html.includes('onclick'));
  assert.ok(!clean.content[0].abVariants[0].html.includes('onclick'));
  assert.ok(!clean.layout.headerOverride.includes('onclick'));
  assert.ok(!clean.analytics.headSnippet.includes('<p>'));
  assert.ok(!clean.fullHtml.includes('onclick'));
});

test('sanitizePage validates design tokens and drops unknown keys', () => {
  const clean = sanitizePage({
    id: 'p', content: [{ id: 's', html: '<p>x</p>', style: {
      bgColor: 'red; } body { display:none } .x {',   // CSS injection
      bgImage: 'x.png") ; } script {',                 // url() breakout
      padding: { top: 40, bogus: 5 },
      radius: 99999,
      unknownKey: 'nope',
    } }],
  });
  const style = clean.content[0].style;
  assert.ok(!('bgColor' in style), 'an unparseable color must be dropped, not escaped');
  assert.ok(!('bgImage' in style));
  assert.ok(!('unknownKey' in style));
  assert.deepEqual(style.padding, { top: 40 }, 'unknown sides are dropped');
  assert.equal(style.radius, 200, 'out-of-range numbers clamp rather than pass through');
});

test('sanitizePage leaves an unstyled section with no style key at all', () => {
  const clean = sanitizePage({ id: 'p', content: [{ id: 's', html: '<p>x</p>' }] });
  assert.ok(!('style' in clean.content[0]));
});

test('admin gates see a Script block nested inside a Layout column', () => {
  const nested = [{ content: [{ blockType: 'layout', fields: { columns: [{ sections: [{ blockType: 'script' }] }] } }] }];
  assert.equal(pagesContainScriptBlock(nested), true);
  assert.equal(pagesContainScriptBlock([{ content: [{ blockType: 'hero' }] }]), false);
  assert.equal(pagesContainFullHtmlMode([{ editorMode: 'full-html' }]), true);
  assert.equal(pagesContainFullHtmlMode([{ editorMode: 'blocks' }]), false);
});

test('global settings: theme colors and custom CSS are both sanitised', () => {
  const clean = sanitizeGlobalSettings({
    theme: { primary: '#fff</style><script>x</script>', customCss: 'body{}</style><script>y</script>' },
    globals: { header: { html: '<div onclick="z">h</div>' } },
    analytics: { headSnippet: '<script>ok()</script>' },
  });
  assert.ok(!clean.theme.primary.includes('<script>'));
  assert.ok(!clean.theme.customCss.includes('<script>'));
  assert.ok(!clean.globals.header.html.includes('onclick'));
  assert.ok(clean.analytics.headSnippet.includes('ok()'));
});

// ------------------------------------------------------------- inline SVG

test('an inline icon survives import intact', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    + '<linearGradient id="g" gradientUnits="userSpaceOnUse"><stop stop-color="#CE011F"/></linearGradient>'
    + '<clipPath id="c"><circle cx="12" cy="12" r="11"/></clipPath>'
    + '<path d="M6 12l4 4 8-8" stroke-width="2" fill="url(#g)" clip-path="url(#c)"/></svg>';
  const out = sanitizeFullPageHtml(svg);
  // Names come back lowercase because the parser lowercases them. That is
  // fine: parsing inline SVG in an HTML document runs the spec's "adjust SVG
  // tag names"/"adjust SVG attributes" tables, so the browser restores
  // viewBox, linearGradient, clipPath and gradientUnits on the way into the
  // DOM. Verified in a browser, not assumed.
  assert.ok(out.includes('viewbox="0 0 24 24"'), 'an SVG without its viewBox does not scale');
  assert.ok(out.includes('lineargradient') && out.includes('stop-color="#CE011F"'));
  assert.ok(out.includes('clippath') && out.includes('gradientunits'));
  assert.ok(out.includes('d="M6 12l4 4 8-8"') && out.includes('stroke-width="2"'));
});

test('the executable half of SVG does not survive', () => {
  const cases = {
    'inline handler': '<svg onload="steal()"><path d="M0" onclick="x()"/></svg>',
    'script child': '<svg><script>steal()</script><path d="M0"/></svg>',
    'nested svg script': '<svg><g><svg><script>steal()</script></svg></g></svg>',
    foreignObject: '<svg><foreignObject><img src=x onerror="steal()"></foreignObject></svg>',
    'SMIL retarget': '<svg><a href="#"><animate attributeName="href" to="javascript:steal()"/></a></svg>',
  };
  for (const [name, input] of Object.entries(cases)) {
    const out = sanitizeFullPageHtml(input);
    assert.ok(!/onload|onclick|onerror/.test(out), `${name}: an event handler survived`);
    assert.ok(!out.includes('steal()'), `${name}: executable content survived`);
    assert.ok(!/<animate|foreignObject/i.test(out), `${name}: a retargeting element survived`);
  }
});

test('a <use> may only point inside its own document', () => {
  const out = sanitizeFullPageHtml(
    '<svg><use href="https://evil.test/x.svg#a"/><use xlink:href="//evil.test/y.svg#b"/><use href="#local"/></svg>',
  );
  assert.ok(!out.includes('evil.test'), 'an external use fetches a document the visitor never asked for');
  assert.ok(out.includes('href="#local"'), 'a same-document reference is the whole point of <use>');
});

test('<title> is scoped: an icon label, never a page title from inside a block', () => {
  const content = sanitizeContentHtml('<title>doc</title><svg><title>Icon</title><path d="M1"/></svg>');
  assert.ok(!content.includes('<title>doc</title>'), 'a block must not set the document title');
  assert.ok(content.includes('<title>Icon</title>'), 'but an SVG needs its accessible name');
  // A full page legitimately has one.
  assert.ok(sanitizeFullPageHtml('<html><head><title>t</title></head><body>x</body></html>').includes('<title>t</title>'));
});

test('a page script outside an SVG is still allowed, as the Script block needs', () => {
  assert.ok(sanitizeContentHtml('<div><script>legit()</script></div>').includes('legit()'));
  assert.ok(sanitizeContentHtml('<svg><path d="M0"/></svg><script>legit()</script>').includes('legit()'));
});
