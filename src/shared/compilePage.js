// Server-side page compiler used by server.js's dynamic routing and the
// static export route. Pages are stored as an ordered list of sections
// (each with raw `html`), optionally A/B-tested via `abVariants`.

import { buildThemeStyleBlock } from './theme.js';
import { buildPageStyleCss } from './blockStyle.js';
import { extractSharedStyles } from './dedupeStyles.js';
import { resolveSectionHtml } from './syncedBlocks.js';

// Walks a page's parentId chain to build its full nested slug path, e.g.
// a page "contact" whose parent is "about" (whose parent is root) becomes
// "about/contact".
export function getFullPath(page, pages) {
  const segments = [];
  let current = page;
  const seen = new Set();
  while (current) {
    if (seen.has(current.id)) break; // guard against corrupt cyclic parentId data
    seen.add(current.id);
    if (current.slug && current.slug !== 'index') segments.unshift(current.slug);
    current = current.parentId ? pages.find(p => p.id === current.parentId) : null;
  }
  return segments.join('/');
}

// Weighted-random pick among a section's A/B variants.
//
// A missing or unparseable weight means 1 (the historical default), but an
// explicit 0 means zero — "hold this variant back" — which the previous
// `v.weight || 1` silently turned into a full share. The comparison is
// `< 0` rather than `<= 0` for the same reason: with `<=`, a leading
// zero-weight variant won whenever the roll landed exactly on the boundary.
export function pickWeightedVariant(variants) {
  const weightOf = (v) => {
    const n = Number(v?.weight);
    return Number.isFinite(n) && n >= 0 ? n : 1;
  };
  const totalWeight = variants.reduce((sum, v) => sum + weightOf(v), 0);
  // Everything held back at once: still render something rather than nothing.
  if (totalWeight <= 0) return variants[Math.floor(Math.random() * variants.length)] || variants[0];
  let roll = Math.random() * totalWeight;
  for (const variant of variants) {
    roll -= weightOf(variant);
    if (roll < 0) return variant;
  }
  return variants[variants.length - 1];
}

const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// Renders one page to a full HTML document: theme CSS variables from global
// settings, each section's html (swapped for its chosen A/B variant's html
// when present), and any per-page/global analytics snippets.
// Resolves the header/footer HTML that should wrap the page's own sections.
// Precedence: per-page override (non-empty string) > global content (if the
// page opts in via layout flags — default is opt-in) > empty string.
export function resolveGlobalContent(page, globalSettings) {
  const layout = page?.layout || {};
  const globals = globalSettings?.globals || {};

  const pickHtml = (which) => {
    const flagKey = which === 'header' ? 'useGlobalHeader' : 'useGlobalFooter';
    const overrideKey = which === 'header' ? 'headerOverride' : 'footerOverride';
    const override = layout[overrideKey];
    if (typeof override === 'string' && override.trim() !== '') return override;
    if (layout[flagKey] === false) return '';
    return globals[which]?.html || '';
  };

  return { headerHtml: pickHtml('header'), footerHtml: pickHtml('footer') };
}

// `origin` (e.g. "https://acme.com") is only known server-side at request
// time -- when present, canonical/og:url tags are emitted; the editor's
// live preview omits it and gets no canonical, which is correct (preview
// HTML should never declare itself the canonical copy of anything).
export function compilePageHtml(page, pages, library, globalSettings, abChoices = {}, origin = '') {
  // Full HTML mode bypasses everything below -- header/footer inheritance,
  // theme variables, analytics injection -- by design ("full document
  // control", see PageEditorPage.jsx's Blocks/Full HTML toggle). The page
  // becomes exactly this one string. A/B variants don't apply here -- there's
  // no per-section concept left to vary, a real but minor v1 limitation.
  if (page.editorMode === 'full-html') return page.fullHtml || '';

  const theme = globalSettings?.theme || {};
  const { headerHtml, footerHtml } = resolveGlobalContent(page, globalSettings);
  const sectionsHtml = (page.content || [])
    .map((section) => {
      if (Array.isArray(section.abVariants) && section.abVariants.length > 0) {
        const chosenId = abChoices[section.id];
        const variant = section.abVariants.find(v => v.id === chosenId) || section.abVariants[0];
        return `<section data-section-id="${section.id}" data-variant-id="${variant.id}">${variant.html || ''}</section>`;
      }
      // A synced section renders its library entry, not its own copy — see
      // src/shared/syncedBlocks.js. This is what `library` was always for.
      return `<section data-section-id="${section.id}">${resolveSectionHtml(section, library)}</section>`;
    })
    .join('\n');

  // Every block inlines its own <style>, so a page with eight card grids
  // shipped the same rules eight times. Identical blocks are hoisted into one
  // stylesheet in the head; anything that appears once is left exactly where
  // it was, so a block's own scoping and ordering are untouched.
  const { html: dedupedSections, css: hoistedCss } = extractSharedStyles(sectionsHtml);

  // Per-section design tokens (the editor's Design inspector) compile to one
  // stylesheet scoped by data-section-id — see src/shared/blockStyle.js.
  // Empty string for any page whose sections were never styled, so those
  // pages emit exactly the markup they did before this existed.
  const sectionStyleCss = buildPageStyleCss(page.content || []);

  const seo = page.seo || {};
  const globalAnalytics = globalSettings?.analytics || {};
  const pageAnalytics = page.analytics || {};
  const title = seo.title || page.name || globalSettings?.siteName || 'Untitled Page';
  const description = seo.description || '';
  const ogImage = seo.ogImage || globalSettings?.defaultOgImage || '';
  const favicon = globalSettings?.favicon || '';
  const canonicalUrl = origin ? `${origin}/${getFullPath(page, pages)}`.replace(/\/$/, '') || origin : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
${favicon ? `<link rel="icon" href="${escapeHtml(favicon)}" />` : ''}
${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}
${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />` : ''}
<meta property="og:title" content="${escapeHtml(title)}" />
${description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : ''}
<meta property="og:type" content="website" />
${canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />` : ''}
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
${globalSettings?.siteName ? `<meta property="og:site_name" content="${escapeHtml(globalSettings.siteName)}" />` : ''}
<style>
${buildThemeStyleBlock(theme)}
</style>
${hoistedCss ? `<style>\n${hoistedCss}\n</style>` : ''}
${sectionStyleCss ? `<style>\n${sectionStyleCss}\n</style>` : ''}
${theme.customCss ? `<style>\n${theme.customCss}\n</style>` : ''}
${globalAnalytics.headSnippet || ''}
${pageAnalytics.headSnippet || ''}
</head>
<body>
${headerHtml ? `<header data-global="header">${headerHtml}</header>` : ''}
${dedupedSections}
${footerHtml ? `<footer data-global="footer">${footerHtml}</footer>` : ''}
${globalAnalytics.bodySnippet || ''}
${pageAnalytics.bodySnippet || ''}
${origin ? `<script>navigator.sendBeacon&&navigator.sendBeacon('/api/public/pv',JSON.stringify({p:location.pathname}));</script>` : ''}
</body>
</html>`;
}
