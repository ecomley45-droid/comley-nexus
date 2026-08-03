// Multi-language routing and on-site search.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLocales, localesOf, isMultilingual, splitLocalePath, localizedPath,
  localizedPage, setTranslation, seedTranslation, removeTranslation, hasTranslation,
  alternateLinks,
} from '../src/shared/i18n.js';
import { buildSearchIndex, searchIndex, highlight, tokenize } from '../src/shared/siteSearch.js';
import { compilePageHtml } from '../src/shared/compilePage.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

const GS = { locales: [{ code: 'en', label: 'English' }, { code: 'es', label: 'Español' }] };
const page = (over = {}) => ({
  id: 'p', name: 'About', slug: 'about', status: 'published',
  content: [{ id: 'a', html: '<p>English copy</p>' }],
  seo: { title: 'About us' }, analytics: {}, layout: {}, ...over,
});

// ---------------------------------------------------------------------- i18n

test('locale codes are validated and deduped, with a default always present', () => {
  assert.deepEqual(normalizeLocales([]), [{ code: 'en', label: 'English' }]);
  assert.deepEqual(normalizeLocales(undefined), [{ code: 'en', label: 'English' }]);
  const clean = normalizeLocales([
    { code: 'en', label: 'English' }, { code: 'EN', label: 'Dupe' },
    { code: 'pt-BR', label: 'Português' }, { code: 'not a code', label: 'X' },
  ]);
  assert.deepEqual(clean.map((l) => l.code), ['en', 'pt-BR']);
  assert.equal(isMultilingual({ locales: [{ code: 'en' }] }), false);
});

test('only declared non-default codes claim a path segment', () => {
  assert.deepEqual(splitLocalePath('es/about', GS), { locale: 'es', path: 'about' });
  assert.deepEqual(splitLocalePath('about', GS), { locale: 'en', path: 'about' });
  assert.deepEqual(splitLocalePath('es', GS), { locale: 'es', path: '' });
  // A page legitimately slugged "it" or "no" must not be swallowed.
  assert.deepEqual(splitLocalePath('it/team', GS), { locale: 'en', path: 'it/team' });
  assert.deepEqual(splitLocalePath('about', { locales: [{ code: 'en' }] }), { locale: 'en', path: 'about' });
});

test('the default language keeps the bare path', () => {
  assert.equal(localizedPath('about', 'en', GS), '/about');
  assert.equal(localizedPath('about', 'es', GS), '/es/about');
  assert.equal(localizedPath('', 'es', GS), '/es');
  assert.equal(localizedPath('', 'en', GS), '/');
});

test('a translation overlays name, SEO and blocks — and nothing else', () => {
  const p = page({ translations: { es: { name: 'Acerca', content: [{ id: 'a', html: '<p>Copia</p>' }] } } });
  const es = localizedPage(p, 'es', GS);
  assert.equal(es.name, 'Acerca');
  assert.equal(es.content[0].html, '<p>Copia</p>');
  assert.equal(es.slug, 'about', 'the address is shared across languages');
  assert.equal(es.status, 'published');
  assert.equal(localizedPage(p, 'en', GS).name, 'About', 'the default is untouched');
});

test('an untranslated page falls back rather than 404ing', () => {
  const es = localizedPage(page(), 'es', GS);
  assert.equal(es.content[0].html, '<p>English copy</p>',
    'a dead link mid-site is worse than one page in the wrong language');
  assert.equal(hasTranslation(page(), 'es', GS), false);
  assert.equal(hasTranslation(page(), 'en', GS), true);
});

test('editing a translation never touches the default language', () => {
  const p = page();
  const patch = setTranslation(p, 'es', { name: 'Acerca' }, GS);
  assert.equal(patch.translations.es.name, 'Acerca');
  assert.equal(p.name, 'About');
  // Editing the default returns the patch unchanged, no translations involved.
  assert.deepEqual(setTranslation(p, 'en', { name: 'X' }, GS), { name: 'X' });
});

test('seeding a translation starts from the real page, not a blank one', () => {
  const seeded = seedTranslation(page(), 'es', GS).translations.es;
  assert.equal(seeded.name, 'About');
  assert.equal(seeded.content[0].html, '<p>English copy</p>');
  seeded.content[0].html = '<p>changed</p>';
  assert.equal(page().content[0].html, '<p>English copy</p>', 'the seed is a deep copy');
});

test('removing a translation drops the key entirely', () => {
  const p = page({ translations: { es: { name: 'Acerca' } } });
  assert.equal(removeTranslation(p, 'es').translations, undefined);
});

test('hreflang covers every locale plus x-default, and is absent when monolingual', () => {
  const tags = alternateLinks('about', GS, 'https://acme.com');
  assert.ok(tags.includes('hreflang="en" href="https://acme.com/about"'));
  assert.ok(tags.includes('hreflang="es" href="https://acme.com/es/about"'));
  assert.ok(tags.includes('hreflang="x-default" href="https://acme.com/about"'));
  assert.equal(alternateLinks('about', { locales: [{ code: 'en' }] }, 'https://acme.com'), '');
  assert.equal(alternateLinks('about', GS, ''), '', 'previews have no origin and get no alternates');
});

test('the compiled page declares the language it is in', () => {
  const p = page();
  assert.ok(compilePageHtml(p, [p], [], GS, {}, 'https://acme.com', 'es').includes('<html lang="es">'));
  assert.ok(compilePageHtml(p, [p], [], GS, {}, 'https://acme.com').includes('<html lang="en">'));
});

test('the language switcher marks the current language and links the others', () => {
  const html = renderBlock('language-switcher', {
    locales: [
      { code: 'en', label: 'English', href: '/about', current: true },
      { code: 'es', label: 'Español', href: '/es/about', current: false },
    ],
  });
  assert.ok(html.includes('aria-current="true"'));
  assert.ok(html.includes('href="/es/about"'));
  assert.ok(!html.includes('href="/about"'), 'the current language is not a link to itself');
  assert.ok(renderBlock('language-switcher', {}).includes('Design settings'),
    'an unconfigured switcher explains itself rather than rendering nothing');
});

// -------------------------------------------------------------------- search

const PAGES = [
  { id: '1', status: 'published', name: 'Pricing', seo: { description: 'Our plans and rates' }, content: [{ html: '<p>Simple pricing for growing teams</p>' }] },
  { id: '2', status: 'published', name: 'About', seo: {}, content: [{ html: '<p>We started in 2016 and price fairly</p>' }] },
  { id: '3', status: 'draft', name: 'Secret pricing', seo: {}, content: [{ html: '<p>unreleased</p>' }] },
];
const index = () => buildSearchIndex(PAGES, { pathFor: (p) => `/${p.name.toLowerCase()}` });

test('drafts are never findable through search', () => {
  const results = searchIndex(index(), 'pricing');
  assert.ok(!results.some((r) => r.title === 'Secret pricing'),
    'a draft is not reachable by URL and must not be reachable by search either');
});

test('a title match outranks a body match', () => {
  const results = searchIndex(index(), 'pricing');
  assert.equal(results[0].title, 'Pricing');
});

test('every term must appear somewhere', () => {
  assert.equal(searchIndex(index(), 'pricing sunday').length, 0);
  assert.equal(searchIndex(index(), 'pricing teams').length, 1);
});

test('empty and stop-word-only queries return nothing rather than everything', () => {
  assert.deepEqual(searchIndex(index(), ''), []);
  assert.deepEqual(searchIndex(index(), '   '), []);
  assert.deepEqual(searchIndex(index(), 'the and of'), []);
  assert.deepEqual(tokenize('The and of a'), []);
});

test('markup is stripped from the indexed text, not searched', () => {
  const idx = buildSearchIndex(
    [{ id: '1', status: 'published', name: 'Styled', seo: {}, content: [{ html: '<style>.x{color:red}</style><p>visible words</p>' }] }],
    { pathFor: () => '/x' }
  );
  assert.equal(searchIndex(idx, 'color').length, 0, 'CSS is not content');
  assert.equal(searchIndex(idx, 'visible').length, 1);
});

test('results are escaped before being highlighted', () => {
  const marked = highlight('<script>alert(1)</script> pricing', 'pricing');
  assert.ok(marked.includes('&lt;script&gt;'));
  assert.ok(marked.includes('<mark>pricing</mark>'));
  assert.ok(!marked.includes('<script>'));
});

test('search indexes the language it is asked for', () => {
  const multilingual = [{
    id: '1', status: 'published', name: 'Pricing', seo: {},
    content: [{ html: '<p>English body</p>' }],
    translations: { es: { name: 'Precios', content: [{ html: '<p>Cuerpo español</p>' }] } },
  }];
  const es = buildSearchIndex(multilingual, {
    locale: 'es',
    localizedPageFor: (p) => localizedPage(p, 'es', GS),
    pathFor: () => '/es/pricing',
  });
  assert.equal(searchIndex(es, 'precios').length, 1);
  assert.equal(searchIndex(es, 'english').length, 0, 'a Spanish search must not return English copy');
});
