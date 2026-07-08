// Shared site-payload helpers for the template marketplace. A template's
// `payload` is stored at the FIELDS level (never rendered html):
//   { pages: [{ name, slug, sections: [{ name, blockType, fields }] }],
//     theme: { primary, secondary, bg, text, accent, link, muted,
//              fontFamily, fontScale } }
// -- exactly the shape src/shared/siteTemplates.js authors by hand, and the
// shape lib/aiSiteGen.js emits before it materializes. Install and preview
// re-render each section's html through the real blockRenderers, so a
// renderer change is reflected everywhere with no data migration.
//
// validateSitePayload() is the safety gate every write goes through: it
// drops unknown/unsafe block types (same allowlist aiSiteGen uses -- no
// `script`, no `layout`), keeps only valid hex colors + known font keys,
// and normalizes slugs. materializeInstall() turns a validated payload into
// save-ready page objects (matching blankPage() / buildTemplateSite()).

import { renderBlock, BLOCK_RENDERERS } from '../src/cms/lib/pasteIn/blockRenderers.js';
import { FONT_STACKS, FONT_SCALES } from '../src/shared/theme.js';
import { SITE_TEMPLATES } from '../src/shared/siteTemplates.js';

// script (arbitrary JS) and layout (nested structure) are excluded from
// templates -- same call aiSiteGen.js makes, for the same trust/robustness
// reasons.
export const INSTALLABLE_BLOCK_TYPES = Object.keys(BLOCK_RENDERERS).filter((t) => t !== 'script' && t !== 'layout');
const THEME_COLOR_KEYS = ['primary', 'secondary', 'bg', 'text', 'accent', 'link', 'muted'];

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function cleanSlug(raw, fallback) {
  const s = String(raw || fallback || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || '';
}

// Keep only valid hex colors and known font keys; anything else is dropped
// so buildThemeStyleBlock's field-by-field fallback fills it in.
export function cleanTheme(raw) {
  const theme = {};
  if (!isPlainObject(raw)) return theme;
  for (const k of THEME_COLOR_KEYS) {
    if (typeof raw[k] === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw[k].trim())) theme[k] = raw[k].trim();
  }
  if (FONT_STACKS[raw.fontFamily]) theme.fontFamily = raw.fontFamily;
  if (FONT_SCALES[raw.fontScale]) theme.fontScale = raw.fontScale;
  return theme;
}

// Normalizes a raw payload down to only the shapes install/preview accept.
// Unknown block types and malformed pages are dropped rather than throwing,
// so a hand-edited or AI-authored template can't take the whole thing down.
export function validateSitePayload(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const theme = cleanTheme(src.theme);
  const pages = [];
  const seenSlugs = new Set();
  const rawPages = Array.isArray(src.pages) ? src.pages : [];
  for (const p of rawPages.slice(0, 12)) {
    if (!isPlainObject(p)) continue;
    const slug = cleanSlug(p.slug, p.name);
    if (!slug || seenSlugs.has(slug)) continue;
    const name = String(p.name || slug).slice(0, 80);
    // Full-HTML page: keep the original document verbatim (it carries its
    // own CSS -- this is the "keep original design" import path). fullHtml is
    // sanitized server-side before storing and again at install via
    // sanitizePage/sanitizeFullPageHtml -- not here, since this module is
    // shared with the browser bundle and can't pull in the Node sanitizer.
    if (p.editorMode === 'full-html' && typeof p.fullHtml === 'string' && p.fullHtml.trim()) {
      seenSlugs.add(slug);
      pages.push({ name, slug, editorMode: 'full-html', fullHtml: p.fullHtml });
      continue;
    }
    if (!Array.isArray(p.sections)) continue;
    const sections = p.sections
      .filter((s) => isPlainObject(s) && INSTALLABLE_BLOCK_TYPES.includes(s.blockType) && isPlainObject(s.fields))
      .slice(0, 24)
      .map((s) => ({ name: String(s.name || s.blockType).slice(0, 80), blockType: s.blockType, fields: s.fields }));
    if (sections.length === 0) continue;
    seenSlugs.add(slug);
    pages.push({ name, slug, sections });
  }
  // The renderer pipeline + public router both assume an index page exists.
  if (pages.length > 0 && !pages.some((p) => p.slug === 'index')) pages[0].slug = 'index';
  return { theme, pages };
}

// Cheap summary for the marketplace card/detail without shipping the whole
// payload to every list row: distinct block types (in first-seen order) and
// page/section counts.
export function summarizePayload(payload) {
  const pages = payload?.pages || [];
  const blockTypes = [];
  let sectionCount = 0;
  let fullHtmlPages = 0;
  for (const p of pages) {
    if (p.editorMode === 'full-html') { fullHtmlPages += 1; continue; }
    for (const s of (p.sections || [])) {
      sectionCount += 1;
      if (!blockTypes.includes(s.blockType)) blockTypes.push(s.blockType);
    }
  }
  return { pageCount: pages.length, sectionCount, blockTypes, fullHtmlPages };
}

// Turns a validated payload into save-ready page objects (html rendered via
// the real renderers), matching buildTemplateSite() in siteTemplates.js and
// blankPage() in src/cms/lib/pageActions.js. `siteName` is only used by the
// caller for settings; pages themselves carry no site name.
export function materializeInstall(payload, { stamp = Date.now() } = {}) {
  const { pages, theme } = validateSitePayload(payload);
  const base = (pi) => ({
    id: `page-${stamp}-${pi}`,
    parentId: null,
    seo: { title: '', description: '', ogImage: '' },
    status: 'published',
    scheduledPublishAt: null,
    analytics: { headSnippet: '', bodySnippet: '' },
    // Full-HTML pages carry their own <header>/<footer>, so they opt out of
    // the workspace's global header/footer; block pages opt in as before.
  });
  const outPages = pages.map((p, pi) => {
    if (p.editorMode === 'full-html') {
      return {
        ...base(pi), name: p.name, slug: p.slug, content: [],
        editorMode: 'full-html', fullHtml: p.fullHtml,
        layout: { useGlobalHeader: false, useGlobalFooter: false, headerOverride: '', footerOverride: '' },
      };
    }
    return {
      ...base(pi), name: p.name, slug: p.slug,
      content: p.sections.map((s, si) => ({
        id: `sec-${stamp}-${pi}-${si}`,
        name: s.name,
        blockType: s.blockType,
        fields: s.fields,
        html: renderBlock(s.blockType, s.fields) || '',
      })).filter((s) => s.html),
      editorMode: 'blocks',
      fullHtml: '',
      layout: { useGlobalHeader: true, useGlobalFooter: true, headerOverride: '', footerOverride: '' },
    };
  });
  return { pages: outPages, theme };
}

// Category + a short feature list for each of the four hand-authored starter
// sites, used to seed the marketplace on first read (see
// siteTemplateStore.list). Keyed by SITE_TEMPLATES id.
const SEED_META = {
  agency: {
    category: 'Business',
    features: ['Services, work, team & contact pages', 'Testimonials and a track-record stats row', 'Bold call-to-action sections', 'Indigo/fuchsia modern theme'],
  },
  restaurant: {
    category: 'Food',
    features: ['Hero banner with hours & reservations', 'Menu highlights and a full menu page', 'Reviews section', 'Warm serif editorial theme'],
  },
  portfolio: {
    category: 'Portfolio',
    features: ['Intro hero + recent work gallery', 'Project card grid', 'Social links row', 'Minimal monospace theme'],
  },
  'local-service': {
    category: 'Services',
    features: ['Services grid with trust stats', 'Rates list + maintenance pricing plans', 'FAQ section', 'Quote-request contact form'],
  },
};

// The initial marketplace inventory, derived from the hardcoded
// SITE_TEMPLATES so the two never drift. Returned as store-row shape.
export function defaultMarketplaceTemplates() {
  return SITE_TEMPLATES.map((t, i) => {
    const meta = SEED_META[t.id] || { category: 'Business', features: [] };
    // Strip the runtime-only siteNamePlaceholder/id/description off the
    // page/theme payload; keep just what validateSitePayload expects.
    const payload = validateSitePayload({ pages: t.pages, theme: t.theme });
    return {
      id: `seed-${t.id}`,
      orgId: null,
      slug: t.id,
      name: t.name,
      category: meta.category,
      description: t.description,
      featureList: meta.features,
      payload,
      sortOrder: i,
    };
  });
}
