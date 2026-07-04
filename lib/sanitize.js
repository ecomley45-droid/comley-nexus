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
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'style', 'data-*', 'aria-*', 'role', 'title', 'lang'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
    source: ['src', 'srcset', 'type', 'media'],
    video: ['src', 'poster', 'controls', 'loop', 'muted', 'autoplay', 'playsinline', 'width', 'height'],
    audio: ['src', 'controls', 'loop', 'muted', 'autoplay'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  // Strip inline event handlers explicitly; sanitize-html allows attrs on
  // a name basis, but adding a belt-and-suspenders regex means a config
  // typo elsewhere can't accidentally re-enable them.
  allowedAttrNamespaces: [],
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
