// Accessibility and SEO checks. The bar these have to clear is not "flags
// something" but "flags the right thing and stays quiet otherwise" — a
// checker that cries wolf gets ignored, which is worse than not having one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditPage, contrastRatio } from '../src/shared/pageAudit.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

const page = (content, over = {}) => ({
  id: 'p', name: 'Home', slug: 'index', content,
  seo: { title: 'A good title', description: 'A good description of the page.', ogImage: 'https://x/og.png' },
  analytics: {}, layout: {}, ...over,
});

const ids = (result) => result.issues.map((i) => i.id);

test('contrast ratios match the WCAG reference values', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(Math.round(contrastRatio('#ffffff', '#ffffff')), 1);
  assert.equal(contrastRatio('not-a-color', '#fff'), null);
});

test('a missing alt is an error, an empty alt is not', () => {
  const missing = auditPage(page([{ id: 's', name: 'Hero', html: '<img src="/a.png">' }]));
  assert.ok(ids(missing).includes('img-alt-missing'));

  const decorative = auditPage(page([{ id: 's', name: 'Hero', html: '<img src="/a.png" alt="">' }]));
  assert.ok(!ids(decorative).includes('img-alt-missing'),
    'alt="" is how you correctly mark a decorative image');
});

test('heading structure: missing H1, several H1s, and skipped levels', () => {
  assert.ok(ids(auditPage(page([{ id: 's', html: '<h2>Only</h2>' }]))).includes('h1-missing'));
  assert.ok(ids(auditPage(page([{ id: 's', html: '<h1>A</h1><h1>B</h1>' }]))).includes('h1-multiple'));
  assert.ok(ids(auditPage(page([{ id: 's', html: '<h1>A</h1><h4>B</h4>' }]))).includes('heading-skip'));
  assert.ok(!ids(auditPage(page([{ id: 's', html: '<h1>A</h1><h2>B</h2><h3>C</h3>' }]))).includes('heading-skip'));
});

test('links: empty text, vague labels, and unsafe new tabs', () => {
  assert.ok(ids(auditPage(page([{ id: 's', html: '<a href="/x"></a>' }]))).includes('link-empty'));
  assert.ok(!ids(auditPage(page([{ id: 's', html: '<a href="/x" aria-label="Home"></a>' }]))).includes('link-empty'),
    'an aria-label is a valid accessible name');
  assert.ok(ids(auditPage(page([{ id: 's', html: '<a href="/x">click here</a>' }]))).includes('link-vague'));
  assert.ok(ids(auditPage(page([{ id: 's', html: '<a href="/x" target="_blank">Docs</a>' }]))).includes('link-noopener'));
  assert.ok(!ids(auditPage(page([{ id: 's', html: '<a href="/x" target="_blank" rel="noopener">Docs</a>' }]))).includes('link-noopener'));
});

test('SEO: missing metadata is reported, good metadata is not', () => {
  const bare = auditPage({ ...page([{ id: 's', html: '<h1>x</h1>' }]), seo: {} });
  assert.ok(ids(bare).includes('seo-title-missing'));
  assert.ok(ids(bare).includes('seo-description-missing'));
  assert.ok(ids(bare).includes('seo-og-image'));

  const good = auditPage(page([{ id: 's', html: `<h1>x</h1>${'<p>word word word</p>'.repeat(30)}` }]));
  assert.deepEqual(ids(good), [], 'a well-formed page should produce no findings at all');
});

test('a workspace-wide social image satisfies the per-page check', () => {
  const p = { ...page([{ id: 's', html: '<h1>x</h1>' }]), seo: { title: 'T', description: 'D' } };
  assert.ok(!ids(auditPage(p, { defaultOgImage: 'https://x/og.png' })).includes('seo-og-image'));
});

test('theme contrast is graded, not just flagged', () => {
  const p = page([{ id: 's', html: '<h1>x</h1>' }]);
  const bad = auditPage(p, { theme: { text: '#cccccc', bg: '#ffffff' } });
  const contrast = bad.issues.find((i) => i.id === 'contrast-body');
  assert.ok(contrast, 'light grey on white is unreadable and must be caught');
  assert.equal(contrast.level, 'error');

  const marginal = auditPage(p, { theme: { text: '#767676', bg: '#ffffff' } });
  assert.ok(!ids(marginal).includes('contrast-body'), '4.5:1 exactly is a pass');
});

test('findings point back at the block that caused them', () => {
  const result = auditPage(page([{ id: 'sec-42', name: 'Gallery', html: '<img src="/a.png">' }]));
  const issue = result.issues.find((i) => i.id === 'img-alt-missing');
  assert.equal(issue.sectionId, 'sec-42');
  assert.ok(issue.detail.includes('Gallery'), 'naming the block is what makes this actionable');
});

test('the score reflects severity and floors at zero', () => {
  const clean = auditPage(page([{ id: 's', html: `<h1>x</h1>${'<p>word word word</p>'.repeat(30)}` }]));
  assert.equal(clean.score, 100);

  const awful = auditPage({
    ...page(Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, html: '<img src="/a.png"><a href="/y"></a>' }))),
    seo: {},
  });
  assert.equal(awful.score, 0);
  assert.ok(awful.counts.error > 0);
});

test('full-code pages are skipped rather than mis-audited', () => {
  const result = auditPage({ ...page([]), editorMode: 'full-html', fullHtml: '<html><body><img src=x></body></html>' });
  assert.equal(result.skipped, 'full-code');
  assert.deepEqual(result.issues, []);
});

test('blocks rendered by the real renderers pass their own checks', () => {
  const fields = {
    headings: ['Our team'], text: ['Some copy.'],
    items: [{ heading: 'Dana', meta: 'Founder', body: 'Bio', image: 'https://cdn/a.png' }],
    images: [{ src: 'https://cdn/b.png', alt: 'A photo' }],
    links: [{ href: '/contact', label: 'Get in touch' }],
  };
  for (const type of ['team-grid', 'gallery', 'card-grid', 'hero', 'cta']) {
    const result = auditPage(page([{ id: 's', name: type, html: renderBlock(type, fields) }]));
    assert.ok(!ids(result).includes('img-alt-missing'), `${type} emits an image with no alt attribute`);
    assert.ok(!ids(result).includes('link-empty'), `${type} emits a link with no accessible name`);
  }
});
