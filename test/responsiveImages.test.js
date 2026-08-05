// Responsive images are applied to finished HTML rather than inside the
// renderers, because card items, listing photos and imported full-HTML pages
// carry bare URL strings that no renderer helper reaches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMediaIndex, applyResponsiveImages } from '../src/shared/responsiveImages.js';

const ROWS = [
  {
    url: 'https://cdn.test/a.webp', width: 2400, height: 1600,
    variants: [{ w: 400, url: 'https://cdn.test/a-400.webp' }, { w: 800, url: 'https://cdn.test/a-800.webp' }],
  },
  { url: 'https://cdn.test/small.webp', width: 300, height: 200, variants: [] },
];
const index = buildMediaIndex(ROWS);
const srcset = (html) => (/srcset="([^"]*)"/.exec(applyResponsiveImages(html, index)) || [])[1];
const sizes = (html) => (/sizes="([^"]*)"/.exec(applyResponsiveImages(html, index)) || [])[1];

test('a hosted image gets every width, original included', () => {
  const out = srcset('<img src="https://cdn.test/a.webp" alt="A">');
  assert.equal(out, 'https://cdn.test/a-400.webp 400w, https://cdn.test/a-800.webp 800w, https://cdn.test/a.webp 2400w');
  // Without the original as a candidate a wide screen could never reach full
  // resolution — it would top out at the largest variant.
  assert.ok(out.includes('a.webp 2400w'));
});

test('an image we do not host is left alone', () => {
  const html = '<img src="https://elsewhere.test/x.jpg" alt="x">';
  assert.equal(applyResponsiveImages(html, index), html, 'we have no smaller copy of someone else’s file');
});

test('an author who already wrote srcset is not second-guessed', () => {
  const html = '<img src="https://cdn.test/a.webp" srcset="mine 1x" alt="A">';
  assert.equal(applyResponsiveImages(html, index), html);
});

test('sizes reflects where the image actually sits', () => {
  // The block stylesheets put the grid class on the wrapper, so this has to
  // be read from the surrounding markup — testing the <img> alone matched
  // nothing and handed every thumbnail a full-width file.
  const grid = sizes('<div class="nx-item"><h3>t</h3><img src="https://cdn.test/a.webp" alt="A"></div>');
  const card = sizes('<a class="lst-card"><div class="lst-shot"><img src="https://cdn.test/a.webp" alt="A"></div></a>');
  const hero = sizes('<section class="px-hero"><img src="https://cdn.test/a.webp" alt="A"></section>');
  assert.ok(grid.includes('360px') && card.includes('360px'));
  assert.ok(!hero.includes('360px'), 'a full-bleed image really does need the wide file');
});

test('intrinsic dimensions are added, but never over an author’s own', () => {
  const auto = applyResponsiveImages('<img src="https://cdn.test/a.webp" alt="A">', index);
  assert.ok(auto.includes('width="2400"') && auto.includes('height="1600"'),
    'reserving the box is what stops the page shifting as images load');
  const sized = applyResponsiveImages('<img src="https://cdn.test/a.webp" width="50" height="50" alt="A">', index);
  assert.ok(sized.includes('width="50"') && !sized.includes('width="2400"'),
    'an explicit size is a deliberate choice');
});

test('an image with no variants still gets its dimensions', () => {
  const out = applyResponsiveImages('<img src="https://cdn.test/small.webp" alt="s">', index);
  assert.ok(!out.includes('srcset='), 'one candidate is not a choice worth offering');
  assert.ok(out.includes('width="300"'));
});

test('self-closing tags stay self-closing', () => {
  const out = applyResponsiveImages('<img src="https://cdn.test/a.webp" alt="A" />', index);
  assert.ok(out.trimEnd().endsWith('/>'));
  assert.ok(out.includes('srcset='));
});

test('applying twice changes nothing', () => {
  const once = applyResponsiveImages('<img src="https://cdn.test/a.webp" alt="A">', index);
  assert.equal(applyResponsiveImages(once, index), once);
});

test('an empty index and empty html are no-ops', () => {
  const html = '<img src="https://cdn.test/a.webp">';
  assert.equal(applyResponsiveImages(html, buildMediaIndex([])), html);
  assert.equal(applyResponsiveImages('', index), '');
  assert.equal(buildMediaIndex().size, 0);
});

test('rows with nothing to offer are not indexed at all', () => {
  assert.equal(buildMediaIndex([{ url: 'https://cdn.test/x.pdf', variants: [] }]).size, 0);
  // A malformed variant is dropped rather than emitted as a broken candidate.
  const i = buildMediaIndex([{ url: 'u', width: 100, variants: [{ w: 0, url: 'bad' }, { url: 'nowidth' }] }]);
  assert.deepEqual(i.get('u').variants, []);
});
