import DOMPurify from 'isomorphic-dompurify';

// Central HTML sanitizer. All fields that end up rendered raw by
// compilePageHtml (section/variant HTML, global header/footer, analytics
// snippets) flow through here before hitting disk, so a compromised or
// malicious admin can't inject persistent script into a client's live site.
//
// The two profiles below reflect the two flavors of "trusted HTML" the
// builder accepts:
//   - CONTENT: page/section/global bodies — layout HTML, no scripts.
//   - ANALYTICS: <script> is intentionally allowed because that's the whole
//     point of the field (GA, PostHog, etc.), but the list is tight and
//     handlers/iframes/objects are blocked.

const CONTENT_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress'],
  ALLOW_DATA_ATTR: true,
};

// Analytics fields legitimately need <script> — GA/PostHog install snippets.
// We keep the tag but strip event handlers and dangerous embeds.
const ANALYTICS_CONFIG = {
  ADD_TAGS: ['script', 'noscript'],
  ADD_ATTR: ['async', 'defer', 'src', 'crossorigin', 'integrity', 'type'],
  FORBID_TAGS: ['iframe', 'object', 'embed', 'base', 'form'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
};

export function sanitizeContentHtml(html) {
  if (typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, CONTENT_CONFIG);
}

export function sanitizeAnalyticsHtml(html) {
  if (typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, ANALYTICS_CONFIG);
}

// Deep-sanitize a page object in place-safe fashion. Called on every page
// write so section/variant HTML plus per-page analytics snippets are all
// cleaned. Returns a new object.
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
