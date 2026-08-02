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

// How many top-level chunks a document may become. A document that would
// produce more than this keeps the remainder in one final block rather than
// handing back an unusable 300-row layer list.
const MAX_BLOCKS = 40;

const looksStructural = (el) =>
  /^(DIV|MAIN|SECTION|ARTICLE)$/.test(el.tagName) && el.children.length > 1;

// Picks the element whose children should become the blocks. A document
// wrapped in a single <div id="root"> should split on that wrapper's
// children, not produce one giant block — so descend through single-child
// wrappers until there's something to actually split.
function splitRoot(body) {
  let node = body;
  let guard = 0;
  while (guard++ < 6) {
    const elements = Array.from(node.children).filter((el) => !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName));
    if (elements.length === 1 && looksStructural(elements[0])) { node = elements[0]; continue; }
    return node;
  }
  return node;
}

const nameFor = (el, index) => {
  const heading = el.querySelector?.('h1,h2,h3');
  const text = heading?.textContent?.trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 48);
  const semantic = { HEADER: 'Header', FOOTER: 'Footer', NAV: 'Navigation', ASIDE: 'Sidebar', SECTION: 'Section', MAIN: 'Main' };
  return semantic[el.tagName] || `Block ${index + 1}`;
};

const mkId = (i) => `sec-${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`;

/**
 * Split a full HTML document into editable blocks.
 *
 * Blocks come out as raw-HTML sections (no `blockType`/`fields`), which is
 * the honest result: the markup is preserved exactly, it's reorderable and
 * deletable, and the Design panel works on it — but the field-by-field
 * Content editor doesn't, because there are no parsed fields to show. The
 * editor says as much and points at "Paste in" for content that should be
 * re-imported as typed blocks instead.
 *
 * Any <style>/<link rel=stylesheet> in <head> is carried into a leading
 * "Page styles" block, otherwise the converted page would lose its look.
 */
export function htmlToSections(fullHtml) {
  if (typeof document === 'undefined' || !fullHtml || !fullHtml.trim()) return [];
  const doc = new DOMParser().parseFromString(fullHtml, 'text/html');
  const sections = [];

  const headStyles = Array.from(doc.head?.querySelectorAll('style, link[rel="stylesheet"]') || [])
    .map((el) => el.outerHTML)
    .join('\n');
  if (headStyles.trim()) {
    sections.push({ id: mkId(0), name: 'Page styles', html: headStyles });
  }

  const root = splitRoot(doc.body || doc.createElement('body'));
  const children = Array.from(root.children).filter((el) => el.tagName !== 'TEMPLATE');

  children.forEach((el, i) => {
    if (sections.length >= MAX_BLOCKS) return;
    const html = el.outerHTML;
    if (!html || !html.trim()) return;
    const isLast = sections.length === MAX_BLOCKS - 1 && i < children.length - 1;
    sections.push({
      id: mkId(i + 1),
      name: isLast ? 'Remaining content' : nameFor(el, i),
      html: isLast ? children.slice(i).map((rest) => rest.outerHTML).join('\n') : html,
    });
  });

  if (sections.length === 0) {
    sections.push({ id: mkId(0), name: 'Imported content', html: doc.body?.innerHTML || '' });
  }
  return sections;
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
