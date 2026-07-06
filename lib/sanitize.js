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
    // form controls: the Contact Form / Newsletter blocks render real
    // <form>s that POST to /api/public/forms. The public site's CSP
    // (form-action 'self') already stops a form from exfiltrating to a
    // foreign origin, and the transformTags entry below rewrites any
    // non-relative action as a second fence.
    'form', 'input', 'textarea', 'label', 'button', 'select', 'option', 'fieldset', 'legend',
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
    form: ['action', 'method', 'enctype', 'name'],
    input: ['type', 'name', 'placeholder', 'required', 'value', 'autocomplete', 'min', 'max', 'step', 'pattern', 'checked'],
    textarea: ['name', 'placeholder', 'required', 'rows', 'cols'],
    label: ['for'],
    button: ['type', 'name', 'value', 'disabled'],
    select: ['name', 'required', 'multiple'],
    option: ['value', 'selected'],
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
    // Forms may only post same-origin (relative path). Belt-and-suspenders
    // with the public site's CSP form-action 'self'.
    form: (tagName, attribs) => {
      if (attribs.action && !attribs.action.startsWith('/')) delete attribs.action;
      return { tagName, attribs };
    },
  },
};

// Full HTML mode (see compilePageHtml's fork in src/shared/compilePage.js)
// lets a page's `fullHtml` field be a real `<!doctype html><html>...`
// document -- CONTENT_CONFIG can't sanitize that safely, since `html`,
// `head`, `body`, `title`, `meta`, `link` aren't in its allowlist and
// sanitize-html would mangle the document structure rather than just
// stripping content. This profile is CONTENT_CONFIG's allowlist plus the
// document-skeleton tags a full page actually needs. `meta` deliberately
// excludes `http-equiv` -- that's how meta-refresh redirects work, and
// there's no legitimate reason a page body needs one.
const FULL_PAGE_CONFIG = {
  ...CONTENT_CONFIG,
  allowedTags: [...CONTENT_CONFIG.allowedTags, 'html', 'head', 'body', 'title', 'meta', 'link', 'base'],
  allowedAttributes: {
    ...CONTENT_CONFIG.allowedAttributes,
    html: ['lang'],
    body: ['class', 'style'],
    meta: ['name', 'content', 'charset', 'property'],
    link: ['rel', 'href', 'type', 'sizes'],
    base: ['href'],
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

// A Script block nested inside a Layout block's column counts too -- a
// Layout is just a normal section whose fields.columns hold their own full
// section objects (see blockRenderers.js's renderLayout), so this has to
// look one level into any 'layout' section's columns. Layouts can't nest
// inside each other (the "Add block" picker excludes 'layout' when opened
// from inside a column), so one level of recursion is all that's possible.
function sectionContainsScript(section) {
  if (section?.blockType === 'script') return true;
  if (section?.blockType === 'layout') {
    return (section.fields?.columns || []).some((col) =>
      (col?.sections || []).some((child) => child?.blockType === 'script'));
  }
  return false;
}

// Whether any page in the batch has a Script block (blockType 'script'),
// top-level or nested inside a Layout block. Callers use this to require
// admin role instead of just editor before saving -- see the
// 'script'/'noscript' entry in CONTENT_CONFIG above for why that extra
// gate exists.
export function pagesContainScriptBlock(pages) {
  return Array.isArray(pages) && pages.some((p) =>
    Array.isArray(p?.content) && p.content.some(sectionContainsScript));
}

// Full HTML mode (see compilePageHtml's fork) is a materially bigger trust
// surface than any single block -- arbitrary <head>/meta control plus
// <script> all at once -- so any page using it requires admin role to
// save, regardless of whether that particular save happens to contain a
// <script> tag. Simpler and safer than content-sniffing every save.
export function pagesContainFullHtmlMode(pages) {
  return Array.isArray(pages) && pages.some((p) => p?.editorMode === 'full-html');
}

export function sanitizeContentHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, CONTENT_CONFIG);
}

export function sanitizeFullPageHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, FULL_PAGE_CONFIG);
}

export function sanitizeAnalyticsHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, ANALYTICS_CONFIG);
}

// Site-wide Custom CSS (Design settings) is raw CSS text injected directly
// inside a <style> tag by compilePageHtml -- not HTML, so sanitizeContentHtml
// (an HTML parser) doesn't apply. Stripping anything shaped like an HTML tag
// is enough to stop a `</style><script>` breakout; valid CSS never contains
// one (a lone `>` for child selectors is untouched -- only `<...>` matches).
export function sanitizeCss(css) {
  if (typeof css !== 'string') return '';
  return css.replace(/<\/?[a-zA-Z][^>]*>/g, '');
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
  const fullHtml = typeof page.fullHtml === 'string' ? sanitizeFullPageHtml(page.fullHtml) : page.fullHtml;
  return { ...page, content, layout, analytics, fullHtml };
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
  // Every theme.* field (colors, and pre-buildThemeStyleBlock this also
  // covered raw font-family strings) ends up interpolated directly into a
  // <style> block by src/shared/theme.js's buildThemeStyleBlock -- these
  // are free-text inputs in Design Settings, not just a fixed color picker
  // value, so without this they're just as much of a `</style><script>`
  // breakout risk as customCss already is. fontFamily/fontScale are looked
  // up through a fixed key map there (unknown keys just fall back to the
  // default), so they can't inject anything even unsanitized, but every
  // other field gets the same treatment as customCss for consistency.
  const COLOR_FIELDS = ['primary', 'secondary', 'bg', 'text', 'accent', 'link', 'muted'];
  const theme = gs.theme && typeof gs.theme === 'object'
    ? {
        ...gs.theme,
        ...Object.fromEntries(COLOR_FIELDS.filter((k) => k in gs.theme).map((k) => [k, sanitizeCss(gs.theme[k] || '')])),
        customCss: sanitizeCss(gs.theme.customCss || ''),
      }
    : gs.theme;
  return { ...gs, theme, globals, analytics };
}
