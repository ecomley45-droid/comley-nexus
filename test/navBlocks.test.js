// The five navigation bars. They share a brand mark, a link row and a mobile
// toggle, so most of what matters holds for all of them and is asserted in a
// loop rather than five times over.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

// Assert against the markup, not the stylesheet. Every one of these blocks
// ships CSS naming the same classes and data attributes as its elements, so a
// bare `html.includes('nv-util-bar')` is satisfied by the rule that styles it
// and proves nothing about whether the element was rendered.
const markup = (html) => String(html).replace(/<style>[\s\S]*?<\/style>/g, '');

const NAVS = ['nav-logo', 'nav-center', 'nav-utility', 'nav-overlay', 'nav-drawer'];
const COLLAPSING = ['nav-logo', 'nav-center', 'nav-utility', 'nav-overlay'];

const FIELDS = {
  headings: ['Ethan Scott'],
  images: [{ src: '/logo.png', alt: 'Ethan Scott' }],
  links: [
    { href: '/', label: 'Home' }, { href: '/homes', label: 'Homes' },
    { href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' },
  ],
  ctaLabel: 'Get in touch', ctaHref: '/contact', logoHeight: 32,
};

test('every nav renders its logo, links and call to action', () => {
  for (const type of NAVS) {
    const html = renderBlock(type, FIELDS);
    assert.ok(html.includes('src="/logo.png"'), `${type}: no logo`);
    assert.ok(html.includes('height:32px'), `${type}: logo height ignored`);
    for (const l of FIELDS.links) {
      assert.ok(html.includes(`href="${l.href}"`), `${type}: lost ${l.label}`);
    }
    assert.ok(html.includes('Get in touch'), `${type}: no call to action`);
  }
});

test('with no logo the site name renders as a wordmark', () => {
  for (const type of NAVS) {
    const html = renderBlock(type, { ...FIELDS, images: [] });
    assert.ok(!html.includes('<img'), `${type}: invented an image`);
    assert.ok(html.includes('<span>Ethan Scott</span>'),
      `${type}: a bar with neither logo nor name is just an empty strip`);
  }
});

test('the logo links home and is announced by name, not "logo"', () => {
  for (const type of NAVS) {
    const html = renderBlock(type, FIELDS);
    assert.ok(/<a class="nv-brand" href="\/"/.test(html) || /class="nv-brand" href="\/"/.test(html),
      `${type}: the mark must be a link home`);
    assert.ok(html.includes('alt="Ethan Scott"'),
      `${type}: "logo, link" tells a screen reader nothing about where it goes`);
  }
  assert.ok(renderBlock('nav-logo', { ...FIELDS, homeHref: '/en' }).includes('href="/en"'),
    'a localised site needs its own home');
});

test('a logo with no alt of its own falls back to the site name', () => {
  const html = renderBlock('nav-logo', { ...FIELDS, images: [{ src: '/l.png' }] });
  assert.ok(html.includes('alt="Ethan Scott"'));
});

test('logo height is clamped to something a header can hold', () => {
  for (const [given, want] of [[0, 32], [undefined, 32], [8, 16], [500, 72], [48, 48]]) {
    assert.ok(renderBlock('nav-logo', { ...FIELDS, logoHeight: given }).includes(`height:${want}px`),
      `${given} should clamp to ${want}`);
  }
});

test('no call to action means no button, not an empty one', () => {
  for (const type of NAVS) {
    const html = markup(renderBlock(type, { ...FIELDS, ctaLabel: '' }));
    assert.ok(!html.includes('nv-cta'), `${type}: rendered a blank button`);
  }
});

test('every bar collapses below 900px instead of overflowing', () => {
  for (const type of COLLAPSING) {
    const html = renderBlock(type, FIELDS);
    assert.ok(html.includes('data-nv-toggle'), `${type}: no mobile toggle`);
    assert.ok(html.includes('aria-expanded="false"'), `${type}: toggle state is not announced`);
    assert.ok(html.includes('@media (min-width:900px)'), `${type}: no breakpoint`);
    assert.ok(html.includes('data-nv-panel'), `${type}: nothing for the toggle to open`);
  }
  // The drawer is a toggle at every width by design, so it has no breakpoint
  // to cross and no separate desktop link row.
  const drawer = markup(renderBlock('nav-drawer', FIELDS));
  assert.ok(drawer.includes('data-nv-toggle') && drawer.includes('nv-sheet'));
  assert.ok(!drawer.includes('class="nv-links"'), 'the drawer has no desktop link row to hide');
});

test('every menu can be closed without hunting for the same small button', () => {
  for (const type of NAVS) {
    const html = renderBlock(type, FIELDS);
    assert.ok(html.includes("e.key === 'Escape'"), `${type}: Escape does not close it`);
  }
  for (const type of COLLAPSING) {
    assert.ok(renderBlock(type, FIELDS).includes('!root.contains(e.target)'),
      `${type}: clicking away does not close it`);
  }
});

test('the drawer locks the page behind it and returns focus', () => {
  const html = renderBlock('nav-drawer', FIELDS);
  assert.ok(html.includes('aria-modal="true"') && html.includes('role="dialog"'));
  // A sheet covering the page while the page keeps scrolling drops you
  // somewhere you never chose when it closes.
  assert.ok(html.includes("documentElement.style.overflow = open ? 'hidden' : ''"));
  assert.ok(html.includes('else btn.focus()'), 'focus has to come back out of the sheet');
});

test('the centred nav splits its links either side of the mark', () => {
  const html = markup(renderBlock('nav-center', FIELDS));
  const left = html.slice(html.indexOf('nv-left'), html.indexOf('nv-brand'));
  const right = html.slice(html.indexOf('nv-right'));
  assert.ok(left.includes('Home') && left.includes('Homes'));
  assert.ok(right.includes('About') && right.includes('Contact'));
  // An odd count leans left rather than dropping one.
  const odd = markup(renderBlock('nav-center', { ...FIELDS, links: FIELDS.links.slice(0, 3) }));
  for (const l of FIELDS.links.slice(0, 3)) assert.ok(odd.includes(`>${l.label}<`), `lost ${l.label}`);
});

test('the utility strip is optional and carries its own links', () => {
  const html = renderBlock('nav-utility', {
    ...FIELDS,
    text: ['Serving the Upstate since 2009'],
    items: [{ heading: '(864) 380-9582', link: 'tel:8643809582' }],
  });
  assert.ok(html.includes('Serving the Upstate since 2009'));
  assert.ok(html.includes('href="tel:8643809582"'));
  assert.ok(!markup(renderBlock('nav-utility', FIELDS)).includes('nv-util-bar'),
    'no strip content should mean no empty strip');
});

test('the overlay starts transparent and swaps to a light logo over the hero', () => {
  const html = renderBlock('nav-overlay', {
    ...FIELDS,
    images: [{ src: '/dark.png', alt: 'Ethan Scott' }, { src: '/light.png', alt: 'Ethan Scott' }],
    solidAfter: 120,
  });
  assert.ok(html.includes('data-solid="0"'), 'it begins over the hero, not solid');
  assert.ok(html.includes('data-solid-after="120"'));
  assert.ok(html.includes('/light.png') && html.includes('/dark.png'));
  assert.ok(html.includes('.nv-overlay[data-solid="1"] { background:var(--color-bg)'));
  // One logo is fine — a mark that reads on both is used throughout.
  const single = renderBlock('nav-overlay', FIELDS);
  assert.equal((single.match(/\/logo\.png/g) || []).length, 2, 'the same file fills both slots');
});

test('an open overlay menu is never left unreadable over a transparent bar', () => {
  const html = renderBlock('nav-overlay', FIELDS);
  assert.ok(html.includes("if(open) root.setAttribute('data-solid','1')"));
});

test('sticky is the default, and can be turned off', () => {
  for (const type of ['nav-logo', 'nav-center', 'nav-utility', 'nav-drawer']) {
    assert.ok(renderBlock(type, FIELDS).includes('data-sticky="1"'), `${type}: should stick by default`);
    assert.ok(renderBlock(type, { ...FIELDS, sticky: false }).includes('data-sticky="0"'), `${type}: cannot unstick`);
  }
  // The overlay is fixed by definition, so it offers no sticky switch.
  assert.ok(!markup(renderBlock('nav-overlay', FIELDS)).includes('data-sticky'));
});

test('authored nav content is escaped', () => {
  const nasty = {
    headings: ['"><script>steal()</script>'],
    images: [{ src: '"><img onerror=x>', alt: '"><b>y</b>' }],
    links: [{ href: 'javascript:void(0)"><script>a()</script>', label: '"><script>b()</script>' }],
    ctaLabel: '"><script>c()</script>', ctaHref: '"><script>d()</script>',
    text: ['"><script>e()</script>'], items: [{ heading: '"><script>f()</script>', link: '"><script>g()</script>' }],
  };
  for (const type of NAVS) {
    const html = renderBlock(type, nasty);
    for (const probe of ['<script>steal()', '<script>a()', '<script>b()', '<script>c()', '<script>e()', '<script>f()']) {
      assert.ok(!html.includes(probe), `${type}: ${probe} survived`);
    }
    assert.ok(!html.includes('<img onerror'), `${type}: image handler survived`);
  }
});
