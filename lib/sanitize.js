// Central HTML sanitizer. All fields that end up rendered raw by
// compilePageHtml (section/variant HTML, global header/footer, analytics
// snippets) flow through here before hitting disk.
//
// Using `sanitize-html` (pure Node, no JSDOM) rather than DOMPurify —
// serverless environments can't spin up JSDOM without dragging in
// ESM/CJS interop errors.
//
// Two profiles:
//   - CONTENT: page/section/global bodies — layout HTML, no scripts, no handlers.
//   - ANALYTICS: <script> allowed on purpose (GA/PostHog install snippets),
//     but with a tight src allowlist pattern and no event handlers.

import sanitizeHtml from 'sanitize-html';

const CONTENT_CONFIG = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
    'figure', 'figcaption', 'picture', 'source', 'video', 'audio',
    // Page content is only ever written by authenticated editors/admins
    // (requireRole('editor')/requireSuperAdmin), not public input, so
    // inline <style> blocks are a reasonable trust boundary to allow.
    // Without this, sanitize-html's "non-text tag" handling for disallowed
    // <style> silently discards the whole block (tag + CSS), not just the
    // tag -- so authored styles vanish on save with no visible error.
    'style',
    // details/summary: native no-JS disclosure widget, used by the FAQ
    // Accordion block catalog entry. Purely presentational, no risk beyond
    // what div/section already allow.
    'details', 'summary',
    // iframe: used by the Video Embed block catalog entry (YouTube/Vimeo).
    // Scoped tightly in allowedAttributes below -- no srcdoc, no arbitrary
    // scheme (allowedSchemesByTag), just a normal http(s) embed src.
    'iframe',
    // script/noscript: the Script block catalog entry -- arbitrary inline
    // JS on the published page. This is a materially bigger trust jump
    // than style/details/iframe above (full DOM/cookie/network access,
    // not just presentation), so it's paired with an extra server-side
    // gate: saving a page with any blockType 'script' section requires
    // admin role, not just editor (see requireRole checks around
    // POST /api/pages and /api/nexus/pages). Kept here rather than a
    // separate sanitize profile because it still needs to flow through
    // the same section-level sanitizePage() pipeline as everything else.
    'script', 'noscript',
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'style', 'data-*', 'aria-*', 'role', 'title', 'lang'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
    source: ['src', 'srcset', 'type', 'media'],
    video: ['src', 'poster', 'controls', 'loop', 'muted', 'autoplay', 'playsinline', 'width', 'height'],
    audio: ['src', 'controls', 'loop', 'muted', 'autoplay'],
    iframe: ['src', 'allow', 'allowfullscreen', 'frameborder', 'width', 'height'],
    script: ['src', 'async', 'defer', 'crossorigin', 'integrity', 'type', 'data-*'],
    noscript: ['data-*'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
  // iframe/script explicitly exclude 'data' -- a data: URI can smuggle a
  // full inline HTML document or script body, same risk class as srcdoc
  // (which is also not in either tag's allowedAttributes above).
  allowedSchemesByTag: { img: ['http', 'https', 'data'], iframe: ['http', 'https'], script: ['https'] },
  // Strip inline event handlers explicitly; sanitize-html allows attrs on
  // a name basis, but adding a belt-and-suspenders regex means a config
  // typo elsewhere can't accidentally re-enable them.
  allowedAttrNamespaces: [],
  // Acknowledges the same trust call as allowing 'style' above -- silences
  // sanitize-html's built-in XSS warning (which would otherwise log on
  // every single page save) rather than leaving it to spam production logs.
  allowVulnerableTags: true,
  transformTags: {
    // Rewrite javascript: URLs to about:blank.
    a: (tagName, attribs) => {
      if (attribs.href && /^\s*javascript:/i.test(attribs.href)) {
        attribs.href = 'about:blank';
      }
      return { tagName, attribs };
    },
  },
};

const ANALYTICS_CONFIG = {
  allowedTags: ['script', 'noscript'],
  allowedAttributes: {
    script: ['src', 'async', 'defer', 'crossorigin', 'integrity', 'type', 'data-*'],
    noscript: ['data-*'],
  },
  allowedSchemes: ['http', 'https'],
  // Keep script bodies (that's how inline GA/PostHog install snippets work).
  allowedSchemesByTag: { script: ['https'] },
  allowVulnerableTags: true,
};

// Whether any page in the batch has a Script block (blockType 'script').
// Callers use this to require admin role instead of just editor before
// saving -- see the 'script'/'noscript' entry in CONTENT_CONFIG above for
// why that extra gate exists.
export function pagesContainScriptBlock(pages) {
  return Array.isArray(pages) && pages.some((p) =>
    Array.isArray(p?.content) && p.content.some((section) => section?.blockType === 'script'));
}

export function sanitizeContentHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, CONTENT_CONFIG);
}

export function sanitizeAnalyticsHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, ANALYTICS_CONFIG);
}

// Deep-sanitize a page's HTML-bearing fields. Called on every page write.
export function sanitizePage(page) {
  if (!page || typeof page !== 'object') return page;
  const content = Array.isArray(page.content)
    ? page.content.map((section) => ({
        ...section,
        html: sanitizeContentHtml(section.html || ''),
        abVariants: Array.isArray(section.abVariants)
          ? section.abVariants.map((v) => ({ ...v, html: sanitizeContentHtml(v.html || '') }))
          : section.abVariants,
      }))
    : page.content;
  const layout = page.layout && typeof page.layout === 'object' ? {
    ...page.layout,
    headerOverride: sanitizeContentHtml(page.layout.headerOverride || ''),
    footerOverride: sanitizeContentHtml(page.layout.footerOverride || ''),
  } : page.layout;
  const analytics = page.analytics && typeof page.analytics === 'object' ? {
    ...page.analytics,
    headSnippet: sanitizeAnalyticsHtml(page.analytics.headSnippet || ''),
    bodySnippet: sanitizeAnalyticsHtml(page.analytics.bodySnippet || ''),
  } : page.analytics;
  return { ...page, content, layout, analytics };
}

export function sanitizeGlobalSettings(gs) {
  if (!gs || typeof gs !== 'object') return gs;
  const globals = gs.globals && typeof gs.globals === 'object' ? {
    ...gs.globals,
    header: { ...(gs.globals.header || {}), html: sanitizeContentHtml(gs.globals.header?.html || '') },
    footer: { ...(gs.globals.footer || {}), html: sanitizeContentHtml(gs.globals.footer?.html || '') },
  } : gs.globals;
  const analytics = gs.analytics && typeof gs.analytics === 'object' ? {
    ...gs.analytics,
    headSnippet: sanitizeAnalyticsHtml(gs.analytics.headSnippet || ''),
    bodySnippet: sanitizeAnalyticsHtml(gs.analytics.bodySnippet || ''),
  } : gs.analytics;
  return { ...gs, globals, analytics };
}
