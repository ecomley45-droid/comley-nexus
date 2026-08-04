// Renderers are pure (fields) -> html, so they're cheap to check
// exhaustively. These run every block type through one standard field
// bundle and assert the properties that must hold for all of them, rather
// than snapshotting markup that's meant to change.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_RENDERERS, renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

const TYPES = Object.keys(BLOCK_RENDERERS).filter((t) => t !== 'layout' && t !== 'script');

// One fully-populated listing, in the shape src/shared/listingsMap.js flattens
// an entry into. Values are all present so the listing blocks render their
// full markup here; their absent-value behaviour is covered in listings.test.js.
const LISTING = {
  slug: 'x', href: '/listings/x', address: '1 Test Street',
  city: 'Testville', state: 'SC', zip: '00000',
  price: 100000, status: 'For sale', tone: 'sale', propertyType: 'House',
  beds: 3, baths: 2, sqft: 1500, lotSize: '0.25 acres', yearBuilt: 2001,
  hoaFee: 40, mls: '999', listedOn: '2026-01-01', lat: 34.85, lng: -82.39,
  image: 'https://cdn.test/l.png',
  gallery: ['https://cdn.test/l.png', 'https://cdn.test/l2.png'],
  features: ['Pool', 'Fireplace'], description: 'A house.',
};

const FIELDS = {
  headings: ['Heading'], text: ['Body copy.'],
  links: [{ href: '/x', label: 'Link' }],
  images: [{ src: 'https://cdn.test/a.png', alt: 'A' }, { src: 'https://cdn.test/b.png', alt: 'B' }],
  items: [{ heading: 'Item', meta: 'Meta', body: 'Body', image: 'https://cdn.test/i.png', link: '/i' }],
  plans: [{ name: 'Plan', price: '$9', period: '/mo', features: ['One'], ctaLabel: 'Go', ctaHref: '#' }],
  image: 'https://cdn.test/p.png', videoUrl: 'https://cdn.test/v.mp4',
  platform: 'ig', limit: 3, month: '2026-03', targetDate: '2026-12-01T00:00:00.000Z',
  buttonLabel: 'Send', productId: 'p1', price: '$9',
  // Listing blocks render from a flattened listing rather than loose fields,
  // and the collection-bound ones from a list of them. Without these the five
  // listing types would only ever be exercised in their empty state.
  listing: LISTING,
  listings: [LISTING],
};

test('every block type renders non-empty html', () => {
  for (const type of TYPES) {
    const html = renderBlock(type, FIELDS);
    assert.ok(html && html.trim(), `${type} rendered nothing`);
  }
});

test('renderBlock refuses unknown types and missing fields', () => {
  assert.equal(renderBlock('not-a-block', FIELDS), null);
  assert.equal(renderBlock('hero', null), null);
});

test('every image carries a loading strategy', () => {
  let seen = 0;
  for (const type of TYPES) {
    for (const tag of (renderBlock(type, FIELDS) || '').match(/<img\b[^>]*>/g) || []) {
      seen += 1;
      assert.ok(/decoding="async"/.test(tag), `${type}: image decodes on the main thread`);
      assert.ok(
        /loading="lazy"/.test(tag) || /fetchpriority="high"/.test(tag),
        `${type}: image is neither deferred nor prioritised — ${tag.slice(0, 80)}`
      );
    }
  }
  assert.ok(seen > 20, 'sanity: the bundle should exercise plenty of images');
});

// Parallax and video-bg are deliberately absent: they paint their backdrop
// through CSS background-image / <video>, so there is no <img> to prioritise.
test('hero-class blocks load their image eagerly, collections lazily', () => {
  for (const type of ['hero-split', 'hero-centered', 'banner', 'banner-image', 'split-content']) {
    const tag = (renderBlock(type, FIELDS).match(/<img\b[^>]*>/) || [''])[0];
    assert.ok(/fetchpriority="high"/.test(tag), `${type} is above the fold; lazy-loading it hurts LCP`);
  }
  for (const type of ['gallery', 'card-grid', 'team-grid', 'logo-cloud']) {
    const tag = (renderBlock(type, FIELDS).match(/<img\b[^>]*>/) || [''])[0];
    assert.ok(/loading="lazy"/.test(tag), `${type} should not block first paint on its images`);
  }
});

test('user text is escaped everywhere it lands', () => {
  const hostile = '"><script>steal()</script>';
  const fields = {
    ...FIELDS,
    headings: [hostile], text: [hostile],
    links: [{ href: hostile, label: hostile }],
    images: [{ src: hostile, alt: hostile }],
    items: [{ heading: hostile, meta: hostile, body: hostile, image: hostile, link: hostile }],
    plans: [{ name: hostile, price: hostile, features: [hostile], ctaLabel: hostile, ctaHref: hostile }],
    image: hostile, buttonLabel: hostile, price: hostile,
  };
  for (const type of TYPES) {
    const html = renderBlock(type, fields) || '';
    assert.ok(!html.includes('<script>steal()'), `${type} emitted an unescaped script tag`);
  }
});

test('customCss is injected ahead of the block, not into it', () => {
  const html = renderBlock('hero', { ...FIELDS, customCss: '.nx-hero{color:red}' });
  assert.ok(html.startsWith('<style>\n.nx-hero{color:red}\n</style>'));
});

test('video URLs are normalised to embeddable form', () => {
  const yt = renderBlock('video', { ...FIELDS, videoUrl: 'https://www.youtube.com/watch?v=abc123' });
  assert.ok(yt.includes('youtube.com/embed/abc123'));
  const vimeo = renderBlock('video', { ...FIELDS, videoUrl: 'https://vimeo.com/12345' });
  assert.ok(vimeo.includes('player.vimeo.com/video/12345'));
});

test('renderers tolerate entirely empty fields', () => {
  for (const type of TYPES) {
    assert.doesNotThrow(() => renderBlock(type, {}), `${type} threw on empty fields`);
  }
});
