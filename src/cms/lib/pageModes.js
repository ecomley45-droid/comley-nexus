// Per-page authoring mode: "No-code" (the block editor) or "Full code" (a
// single hand-written HTML document). Both representations always persist on
// a page — `content` and `fullHtml` — so nothing is ever destroyed; the mode
// only decides which one compilePageHtml serves.
//
// Converting between the two never edits the page you're on. It creates a
// SEPARATE duplicate page, always as a draft, so the live version keeps
// serving while you work on the converted copy — and if the conversion
// isn't what you wanted, you just delete the copy.

import { compilePageHtml } from '../../shared/compilePage.js';
import { splitHtmlIntoSections } from '../../shared/htmlSections.js';

export const PAGE_MODES = {
  blocks: {
    key: 'blocks',
    label: 'No-code',
    description: 'Build with blocks, drag to reorder, style with the Design panel. No HTML needed.',
  },
  'full-html': {
    key: 'full-html',
    label: 'Full code',
    description: 'One hand-written HTML document, served exactly as typed. Theme, header and footer are bypassed.',
  },
};

export const modeOf = (page) => (page?.editorMode === 'full-html' ? 'full-html' : 'blocks');
export const otherMode = (mode) => (mode === 'full-html' ? 'blocks' : 'full-html');

// ---------------------------------------------------------------------------
// Slug / name uniqueness
// ---------------------------------------------------------------------------

function uniqueSlug(base, pages, parentId) {
  const taken = new Set(
    pages.filter((p) => (p.parentId || null) === (parentId || null)).map((p) => p.slug)
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// ---------------------------------------------------------------------------
// Full code -> No-code
// ---------------------------------------------------------------------------

/**
 * Split a full HTML document into editable blocks.
 *
 * Delegates to the shared, DOM-free scanner in src/shared/htmlSections.js —
 * the same one the marketplace uses when installing a hand-written template
 * page, so converting a page here and installing a template there produce
 * identical blocks.
 *
 * Blocks come out as raw-HTML sections (no `blockType`/`fields`), which is
 * the honest result: the markup is preserved exactly, it's reorderable and
 * deletable, and the Design panel works on it — but the field-by-field
 * Content editor doesn't, because there are no parsed fields to show. The
 * editor says as much and points at "Paste in" for content that should be
 * re-imported as typed blocks instead.
 */
export function htmlToSections(fullHtml) {
  const stamp = Date.now();
  return splitHtmlIntoSections(fullHtml, {
    makeId: (i) => `sec-${stamp}-${i}-${Math.floor(Math.random() * 1e6)}`,
  });
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Build the converted duplicate of `page` in `targetMode`.
 *
 * Never mutates or replaces the source page — returns a brand-new page
 * object, always `status: 'draft'` and on a fresh slug, for the caller to
 * append to the pages array.
 */
export function buildConvertedPage(page, pages, targetMode, { library = [], globalSettings = {} } = {}) {
  const suffix = targetMode === 'full-html' ? 'full-code' : 'no-code';
  const converted = {
    ...structuredClone(page),
    id: `page-${Date.now()}`,
    name: `${page.name} (${PAGE_MODES[targetMode].label})`,
    slug: uniqueSlug(`${page.slug || 'page'}-${suffix}`, pages, page.parentId || null),
    // A converted copy is never live: the original keeps serving until you
    // decide the copy is ready and publish it yourself.
    status: 'draft',
    scheduledPublishAt: null,
    editorMode: targetMode,
  };

  if (targetMode === 'full-html') {
    // Exactly what the block version compiles to today — theme variables,
    // header/footer and all — so the coded copy starts as a pixel-identical
    // snapshot you can then edit freely.
    converted.fullHtml = compilePageHtml(page, pages, library, globalSettings);
  } else {
    converted.content = htmlToSections(page.fullHtml || '');
    converted.fullHtml = '';
    // A converted page is a standalone document; re-inheriting the site
    // header/footer on top of markup that already contains its own would
    // double them up.
    converted.layout = { ...(page.layout || {}), useGlobalHeader: false, useGlobalFooter: false };
  }

  // A/B variants are per-section experiments that don't survive a re-split.
  if (Array.isArray(converted.content)) {
    converted.content = converted.content.map(({ abVariants: _abVariants, ...section }) => section);
  }
  return converted;
}

// What the user is told before the duplicate is created.
export function conversionSummary(page, targetMode) {
  if (targetMode === 'full-html') {
    return [
      'Creates a draft copy of this page as one editable HTML document.',
      'The copy starts as an exact snapshot of how this page renders today.',
      'Theme, site header/footer and analytics injection stop applying to the copy — the document controls all of it.',
      'Only workspace admins can save a full-code page.',
    ];
  }
  return [
    'Creates a draft copy of this page split into editable blocks.',
    'Blocks come across as raw HTML — reorderable, deletable, and stylable in the Design panel.',
    'Stylesheets from the document are carried over into a "Page styles" block.',
    'The Content panel needs typed blocks, so use "Paste in" or the block catalog to rebuild parts you want to edit field-by-field.',
  ];
}
