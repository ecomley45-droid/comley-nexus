// Multi-language sites.
//
// A workspace declares its locales in global settings; the first one is the
// default and serves at the normal path (`/about`), every other one serves
// under its code (`/es/about`). A page holds per-locale overrides in
// `translations`, so one page is one URL in every language rather than a
// parallel tree of duplicate pages that drift apart.
//
// What a translation covers is deliberately narrow: the name, the SEO
// metadata and the blocks. Slug, parent and status are shared — a page
// either exists or it doesn't, and having /es/acerca while /about is deleted
// is a broken-site generator.
//
// Interaction with drafts (src/shared/pageDrafts.js): a draft applies to the
// DEFAULT locale's content. Translations are edited directly. Layering
// per-locale drafts on top would give four combinations of "what am I
// looking at" for a marginal gain.

export const DEFAULT_LOCALE = { code: 'en', label: 'English' };

// BCP-47-ish: `en`, `en-GB`, `zh-Hans`. Restricted because the code becomes a
// URL segment and an hreflang value.
const CODE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export function normalizeLocales(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [DEFAULT_LOCALE];
  const seen = new Set();
  const out = [];
  for (const l of raw.slice(0, 25)) {
    if (!l || typeof l !== 'object') continue;
    const code = String(l.code || '').trim();
    if (!CODE_RE.test(code) || seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    out.push({ code, label: String(l.label || code).slice(0, 40) });
  }
  return out.length ? out : [DEFAULT_LOCALE];
}

export const defaultLocaleOf = (globalSettings) => normalizeLocales(globalSettings?.locales)[0];
export const localesOf = (globalSettings) => normalizeLocales(globalSettings?.locales);
export const isMultilingual = (globalSettings) => localesOf(globalSettings).length > 1;

/**
 * Split a request path into a locale and the remaining page path.
 *
 * Only the declared non-default codes are recognised, so a page whose slug
 * happens to be `no` or `it` keeps working — the alternative (treating any
 * two-letter first segment as a locale) silently breaks real pages.
 */
export function splitLocalePath(path, globalSettings) {
  const locales = localesOf(globalSettings);
  const fallback = { locale: locales[0].code, path: String(path || '') };
  if (locales.length < 2) return fallback;

  const clean = String(path || '').replace(/^\/+/, '');
  const [first, ...rest] = clean.split('/');
  const match = locales.slice(1).find((l) => l.code.toLowerCase() === String(first).toLowerCase());
  if (!match) return fallback;
  return { locale: match.code, path: rest.join('/') };
}

/** The public path for a page path in a locale. */
export function localizedPath(path, locale, globalSettings) {
  const locales = localesOf(globalSettings);
  const clean = String(path || '').replace(/^\/+/, '');
  if (!locale || locale === locales[0].code) return `/${clean}`;
  return `/${locale}${clean ? `/${clean}` : ''}`;
}

/** Whether a page has content authored for a locale. */
export function hasTranslation(page, locale, globalSettings) {
  if (!locale || locale === defaultLocaleOf(globalSettings).code) return true;
  const t = page?.translations?.[locale];
  return !!t && Object.keys(t).length > 0;
}

/**
 * The page as it should render in `locale`: default fields with the
 * translation laid over. An untranslated page falls back to the default
 * language rather than 404ing — a visitor seeing the English version of one
 * page is better than a dead link in the middle of a translated site.
 */
export function localizedPage(page, locale, globalSettings) {
  if (!page) return page;
  const base = defaultLocaleOf(globalSettings).code;
  if (!locale || locale === base) return page;
  const t = page.translations?.[locale];
  if (!t) return page;
  return {
    ...page,
    ...(t.name ? { name: t.name } : {}),
    ...(t.seo ? { seo: { ...(page.seo || {}), ...t.seo } } : {}),
    ...(Array.isArray(t.content) ? { content: t.content } : {}),
  };
}

/** Write an edit into a locale's translation, leaving the default alone. */
export function setTranslation(page, locale, patch, globalSettings) {
  const base = defaultLocaleOf(globalSettings).code;
  if (!locale || locale === base) return patch;
  const existing = page?.translations?.[locale] || {};
  return { translations: { ...(page?.translations || {}), [locale]: { ...existing, ...patch } } };
}

/** Seed a locale from the default language so there's something to edit. */
export function seedTranslation(page, locale, globalSettings) {
  const base = defaultLocaleOf(globalSettings).code;
  if (!locale || locale === base) return {};
  return setTranslation(page, locale, {
    name: page.name,
    seo: { ...(page.seo || {}) },
    content: structuredClone(page.content || []),
  }, globalSettings);
}

/** Drop a locale's translation entirely. */
export function removeTranslation(page, locale) {
  const next = { ...(page?.translations || {}) };
  delete next[locale];
  return { translations: Object.keys(next).length ? next : undefined };
}

/**
 * `<link rel="alternate" hreflang>` tags for a page.
 *
 * Emitted for every declared locale plus `x-default` pointing at the default
 * language, which is what tells a search engine these are the same page in
 * different languages rather than duplicate content competing with itself.
 */
export function alternateLinks(pagePath, globalSettings, origin) {
  if (!origin || !isMultilingual(globalSettings)) return '';
  const locales = localesOf(globalSettings);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const tags = locales.map((l) =>
    `<link rel="alternate" hreflang="${esc(l.code)}" href="${esc(origin + localizedPath(pagePath, l.code, globalSettings))}" />`);
  tags.push(`<link rel="alternate" hreflang="x-default" href="${esc(origin + localizedPath(pagePath, locales[0].code, globalSettings))}" />`);
  return tags.join('\n');
}
