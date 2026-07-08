// Turns segment.js's extracted `fields` into publishable HTML for a given
// `blockType`. This deliberately re-skins imported content in Nexus's own
// plain styling rather than preserving the source site's original CSS --
// `fields` only captures text/src/href, never classes or computed styles,
// so there is no original design to preserve. `fields.customCss` is the
// escape hatch: a coder can add real CSS rules targeting the renderer's own
// classes (`nx-header`, `nx-item`, etc.) or their own selectors. Output
// still passes through sanitizeContentHtml server-side on save like any
// hand-authored section.
//
// Every renderer is pure: (fields) -> html string. Structured-view editors
// call the matching renderer on every field change so `section.html` (the
// only thing compilePageHtml ever reads) stays in sync with `section.fields`.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const headingsHtml = (headings = [], startAt = 1) =>
  headings.map((h, i) => `<h${Math.min(startAt + i, 4)}>${esc(h)}</h${Math.min(startAt + i, 4)}>`).join('\n');

const textHtml = (text = []) => text.map((p) => `<p>${esc(p)}</p>`).join('\n');

const linksHtml = (links = [], className = 'nx-link') =>
  links.map((l) => `<a class="${className}" href="${esc(l.href || '#')}">${esc(l.label || l.href || 'Link')}</a>`).join('\n');

function itemCard(item) {
  return `<div class="nx-item">
  ${item.image ? `<img src="${esc(item.image)}" alt="" />` : ''}
  ${item.heading ? `<h3>${esc(item.heading)}</h3>` : ''}
  ${item.meta ? `<div class="nx-item-meta">${esc(item.meta)}</div>` : ''}
  ${item.body ? `<p>${esc(item.body)}</p>` : ''}
  ${item.link ? `<a href="${esc(item.link)}">Learn more</a>` : ''}
</div>`;
}

const BASE_STYLE = `
.nx-item { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 14px; padding: 20px; }
.nx-item img { width: 100%; border-radius: 8px; margin-bottom: 12px; }
.nx-item-meta { font-size: 13px; color: var(--color-link); margin: -8px 0 8px; }
.nx-link { color: var(--color-link); text-decoration: none; }
`;

// youtube.com/watch, youtu.be, and vimeo.com URLs get rewritten to their
// embeddable form; anything else is assumed to already be an embed URL.
function toEmbedUrl(url) {
  const u = String(url || '').trim();
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = u.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return u;
}

export function renderHeader(fields) {
  return `<style>${BASE_STYLE}
.nx-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; }
</style>
<div class="nx-header">
  <div>${headingsHtml(fields.headings.slice(0, 1))}</div>
  <nav style="display:flex; gap:16px;">${linksHtml(fields.links)}</nav>
</div>`;
}

export function renderNavigation(fields) {
  return `<style>${BASE_STYLE}
.nx-nav { display: flex; gap: 20px; padding: 12px 24px; }
</style>
<nav class="nx-nav">${linksHtml(fields.links)}</nav>`;
}

export function renderFooter(fields) {
  return `<style>${BASE_STYLE}
.nx-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 24px; font-size: 14px; color: var(--color-muted); border-top: 1px solid rgba(255,255,255,0.08); }
</style>
<footer class="nx-footer">
  <div>${textHtml(fields.text)}</div>
  <div style="display:flex; gap:16px;">${linksHtml(fields.links)}</div>
</footer>`;
}

export function renderHero(fields) {
  return `<style>${BASE_STYLE}
.nx-hero { text-align: center; padding: 64px 24px; max-width: 720px; margin: 0 auto; }
.nx-hero .nx-cta { display: inline-block; margin-top: 20px; padding: 12px 24px; border-radius: 10px; background: var(--color-accent); color: white; text-decoration: none; }
</style>
<div class="nx-hero">
  ${headingsHtml(fields.headings, 1)}
  ${textHtml(fields.text)}
  ${fields.links?.[0] ? `<a class="nx-cta" href="${esc(fields.links[0].href || '#')}">${esc(fields.links[0].label || 'Learn more')}</a>` : ''}
</div>`;
}

export function renderCta(fields) {
  return `<style>${BASE_STYLE}
.nx-cta-section { text-align: center; padding: 48px 24px; max-width: 640px; margin: 0 auto; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 20px; }
.nx-cta-section a { display: inline-block; margin: 8px; padding: 11px 22px; border-radius: 10px; background: var(--color-accent); color: white; text-decoration: none; }
</style>
<div class="nx-cta-section">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  ${fields.links.map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || 'Learn more')}</a>`).join('')}
</div>`;
}

export function renderFeature(fields) {
  return `<style>${BASE_STYLE}
.nx-feature { padding: 48px 24px; max-width: 800px; margin: 0 auto; }
</style>
<div class="nx-feature">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
</div>`;
}

// Shared form chrome. Both Contact Form and Newsletter POST to the public
// forms endpoint -- server resolves the org from the request host, stores
// the submission, and (optionally) emails the workspace admins. The `_hp`
// input is a honeypot: visually hidden, humans leave it empty, naive bots
// fill it and get silently dropped server-side.
const FORM_STYLE = `
.nx-form { max-width: 480px; margin: 0 auto; padding: 32px 24px; text-align: left; }
.nx-form label { display: block; font-size: 13px; color: var(--color-muted); margin: 12px 0 4px; }
.nx-form input, .nx-form textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: var(--color-text); font: inherit; }
.nx-form button { margin-top: 16px; padding: 11px 22px; border-radius: 10px; border: 0; background: var(--color-accent); color: white; font: inherit; cursor: pointer; }
.nx-form .nx-hp { position: absolute; left: -9999px; }
`;

export function renderForm(fields) {
  return `<style>${BASE_STYLE}${FORM_STYLE}</style>
<div class="nx-form">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  <form action="/api/public/forms" method="POST">
    <input type="hidden" name="_form" value="Contact form" />
    <input type="text" name="_hp" class="nx-hp" tabindex="-1" autocomplete="off" />
    <label for="nx-name">Name</label>
    <input type="text" id="nx-name" name="name" required />
    <label for="nx-email">Email</label>
    <input type="email" id="nx-email" name="email" required />
    <label for="nx-message">Message</label>
    <textarea id="nx-message" name="message" rows="4" required></textarea>
    <button type="submit">${esc(fields.buttonLabel || 'Send message')}</button>
  </form>
</div>`;
}

export function renderContent(fields) {
  return `<style>${BASE_STYLE}
.nx-content { padding: 32px 24px; max-width: 720px; margin: 0 auto; }
</style>
<div class="nx-content">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  ${fields.images.map((img) => `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}" style="max-width:100%; border-radius:8px;" />`).join('\n')}
  ${linksHtml(fields.links)}
</div>`;
}

// Shared by the three collection types -- they extract the same `items`
// shape from segment.js and only differ in wrapper layout.
function renderCollection(fields, wrapperClass, wrapperStyle) {
  const items = (fields.items || []).map(itemCard).join('\n');
  return `<style>${BASE_STYLE}
.${wrapperClass} { ${wrapperStyle} }
</style>
${headingsHtml(fields.headings, 2)}
<div class="${wrapperClass}">${items}</div>`;
}

export function renderCardGrid(fields) {
  return renderCollection(fields, 'nx-card-grid',
    'display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; padding: 24px;');
}

export function renderScrollingCards(fields) {
  return renderCollection(fields, 'nx-scroll-cards',
    'display: flex; gap: 16px; overflow-x: auto; padding: 24px; scroll-snap-type: x mandatory;');
}

export function renderList(fields) {
  const items = (fields.items || []).map(itemCard).join('\n');
  return `<style>${BASE_STYLE}
.nx-list { display: flex; flex-direction: column; gap: 12px; padding: 24px; max-width: 720px; margin: 0 auto; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-list">${items}</div>`;
}

export function renderBreadcrumb(fields) {
  // v1: a manually-entered static trail, not a dynamic parent-chain lookup
  // -- that would need renderBlock() to receive `pages`/`page`, not just
  // `fields`. See catalog entry description for this limitation.
  const crumbs = (fields.links || []);
  return `<style>${BASE_STYLE}
.nx-breadcrumb { display: flex; gap: 8px; align-items: center; padding: 12px 24px; font-size: 13px; color: var(--color-muted); }
.nx-breadcrumb a { color: var(--color-muted); text-decoration: none; }
.nx-breadcrumb a:hover { color: #e2e8f0; }
.nx-breadcrumb span { color: #52525b; }
</style>
<nav class="nx-breadcrumb">${crumbs.map((l, i) => `${i > 0 ? '<span>/</span>' : ''}<a href="${esc(l.href || '#')}">${esc(l.label || l.href)}</a>`).join('')}</nav>`;
}

export function renderBanner(fields) {
  return `<style>${BASE_STYLE}
.nx-banner { position: relative; text-align: center; padding: 40px 24px; border-radius: 16px; overflow: hidden; }
.nx-banner img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; opacity: 0.35; }
.nx-banner-content { position: relative; z-index: 1; }
</style>
<div class="nx-banner">
  ${fields.images?.[0] ? `<img src="${esc(fields.images[0].src)}" alt="${esc(fields.images[0].alt || '')}" />` : ''}
  <div class="nx-banner-content">
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${fields.links?.[0] ? `<a class="nx-link" href="${esc(fields.links[0].href || '#')}">${esc(fields.links[0].label || 'Learn more')}</a>` : ''}
  </div>
</div>`;
}

export function renderStats(fields) {
  const items = fields.items || [];
  return `<style>${BASE_STYLE}
.nx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 24px; padding: 40px 24px; text-align: center; }
.nx-stat .num { font-size: 40px; font-weight: 700; background: var(--color-accent); -webkit-background-clip: text; background-clip: text; color: transparent; }
.nx-stat .label { font-size: 13px; color: var(--color-muted); margin-top: 4px; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-stats">${items.map((it) => `<div class="nx-stat"><div class="num">${esc(it.heading)}</div><div class="label">${esc(it.body)}</div></div>`).join('')}</div>`;
}

export function renderLogoCloud(fields) {
  return `<style>${BASE_STYLE}
.nx-logo-cloud { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 32px; padding: 32px 24px; opacity: 0.7; }
.nx-logo-cloud img { max-height: 32px; filter: grayscale(1); }
</style>
${headingsHtml(fields.headings, 3)}
<div class="nx-logo-cloud">${(fields.images || []).map((img) => `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}" />`).join('')}</div>`;
}

export function renderTestimonials(fields) {
  return renderCollection(fields, 'nx-testimonials',
    'display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; padding: 24px;');
}

export function renderTeam(fields) {
  return renderCollection(fields, 'nx-team',
    'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 24px;');
}

export function renderPricingTable(fields) {
  const plans = fields.plans || [];
  return `<style>${BASE_STYLE}
.nx-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; padding: 24px; align-items: start; }
.nx-plan { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 16px; padding: 24px; }
.nx-plan.highlighted { border-color: rgba(217,70,239,0.5); background: rgba(255,255,255,0.06); }
.nx-plan .name { font-weight: 600; margin-bottom: 8px; }
.nx-plan .price { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
.nx-plan .period { font-size: 13px; color: var(--color-muted); }
.nx-plan ul { list-style: none; padding: 0; margin: 16px 0; font-size: 14px; color: #d4d4d8; }
.nx-plan li { padding: 4px 0; }
.nx-plan a { display: block; text-align: center; padding: 10px; border-radius: 10px; background: var(--color-accent); color: white; text-decoration: none; margin-top: 12px; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-pricing-grid">
${plans.map((p) => `<div class="nx-plan${p.highlighted ? ' highlighted' : ''}">
  <div class="name">${esc(p.name)}</div>
  <div class="price">${esc(p.price)}<span class="period"> ${esc(p.period || '')}</span></div>
  <ul>${(p.features || []).map((f) => `<li>✓ ${esc(f)}</li>`).join('')}</ul>
  <a href="${esc(p.ctaHref || '#')}">${esc(p.ctaLabel || 'Choose plan')}</a>
</div>`).join('')}
</div>`;
}

export function renderNewsletter(fields) {
  return `<style>${BASE_STYLE}${FORM_STYLE}
.nx-newsletter { text-align: center; }
.nx-newsletter form { display: flex; gap: 8px; margin-top: 16px; }
.nx-newsletter input[type="email"] { flex: 1; }
.nx-newsletter button { margin-top: 0; white-space: nowrap; }
</style>
<div class="nx-form nx-newsletter">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  <form action="/api/public/forms" method="POST">
    <input type="hidden" name="_form" value="Newsletter signup" />
    <input type="text" name="_hp" class="nx-hp" tabindex="-1" autocomplete="off" />
    <input type="email" name="email" placeholder="you@example.com" required />
    <button type="submit">${esc(fields.buttonLabel || 'Subscribe')}</button>
  </form>
</div>`;
}

export function renderImage(fields) {
  const img = fields.images?.[0];
  return `<style>${BASE_STYLE}
.nx-image-block { padding: 16px 24px; text-align: center; }
.nx-image-block img { max-width: 100%; border-radius: 12px; }
</style>
<div class="nx-image-block">${img ? `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}" />` : ''}</div>`;
}

export function renderGallery(fields) {
  return `<style>${BASE_STYLE}
.nx-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 24px; }
.nx-gallery img { width: 100%; height: 160px; object-fit: cover; border-radius: 10px; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-gallery">${(fields.images || []).map((img) => `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}" />`).join('')}</div>`;
}

export function renderVideo(fields) {
  return `<style>${BASE_STYLE}
.nx-video-wrap { padding: 16px 24px; max-width: 800px; margin: 0 auto; }
.nx-video-frame { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; }
.nx-video-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-video-wrap"><div class="nx-video-frame">${fields.videoUrl ? `<iframe src="${esc(toEmbedUrl(fields.videoUrl))}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` : ''}</div></div>`;
}

export function renderFaq(fields) {
  const items = fields.items || [];
  return `<style>${BASE_STYLE}
.nx-faq { max-width: 720px; margin: 0 auto; padding: 24px; }
.nx-faq details { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; }
.nx-faq summary { cursor: pointer; font-weight: 600; }
.nx-faq p { margin: 10px 0 0; color: var(--color-muted); font-size: 14px; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-faq">${items.map((it) => `<details><summary>${esc(it.heading)}</summary><p>${esc(it.body)}</p></details>`).join('')}</div>`;
}

export function renderTabs(fields) {
  // Static grouped layout, not interactive click-to-switch tabs -- that
  // needs <input>/<label> in the sanitizer's allowlist for a CSS-only
  // tab hack, a bigger trust-surface call than this block needs. Labels
  // are shown as a strip above each stacked panel instead.
  const items = fields.items || [];
  return `<style>${BASE_STYLE}
.nx-tabs { max-width: 720px; margin: 0 auto; padding: 24px; }
.nx-tab-labels { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.nx-tab-labels span { padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); font-size: 13px; }
.nx-tab-panel { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 12px; padding: 18px; margin-bottom: 10px; }
.nx-tab-panel h4 { margin: 0 0 8px; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-tabs">
  <div class="nx-tab-labels">${items.map((it) => `<span>${esc(it.heading)}</span>`).join('')}</div>
  ${items.map((it) => `<div class="nx-tab-panel"><h4>${esc(it.heading)}</h4><p>${esc(it.body)}</p></div>`).join('')}
</div>`;
}

export function renderCountdown(fields) {
  // Static styled deadline display, not a live-ticking countdown -- that
  // needs an inline <script>, which isn't in the sanitizer's allowlist
  // (unlike <style>, that's a much bigger trust-surface call left for a
  // deliberate follow-up decision rather than bundled into this feature).
  const date = fields.targetDate ? new Date(fields.targetDate) : null;
  const display = date && !isNaN(date) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD';
  return `<style>${BASE_STYLE}
.nx-countdown { text-align: center; padding: 40px 24px; }
.nx-countdown .date { font-size: 28px; font-weight: 700; background: var(--color-accent); -webkit-background-clip: text; background-clip: text; color: transparent; margin-top: 8px; }
</style>
<div class="nx-countdown">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  <div class="date">${esc(display)}</div>
</div>`;
}

export function renderSocialLinks(fields) {
  return `<style>${BASE_STYLE}
.nx-social { display: flex; justify-content: center; gap: 16px; padding: 24px; flex-wrap: wrap; }
.nx-social a { padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; text-decoration: none; font-size: 13px; }
</style>
<div class="nx-social">${linksHtml(fields.links, '')}</div>`;
}

// A single sellable product: image, name, price, and a Buy button that's
// a plain link to the hosted-checkout endpoint (GET /api/public/buy/:id)
// -- no client JS, works under the public site's strict CSP. `productId`
// comes from the workspace's Commerce > Products list; without one the
// button renders as an inert placeholder so an unconfigured block can't
// send visitors to a 404.
export function renderProduct(fields) {
  const buyHref = fields.productId ? `/api/public/buy/${esc(fields.productId)}` : '';
  const button = buyHref
    ? `<a class="nx-buy" href="${buyHref}">${esc(fields.buttonLabel || 'Buy now')}</a>`
    : `<span class="nx-buy nx-buy-disabled">${esc(fields.buttonLabel || 'Buy now')}</span>`;
  return `<style>${BASE_STYLE}
.nx-product { display: flex; gap: 24px; align-items: center; max-width: 720px; margin: 0 auto; padding: 32px 24px; flex-wrap: wrap; }
.nx-product img { width: 260px; max-width: 100%; border-radius: 14px; }
.nx-product-info { flex: 1; min-width: 220px; }
.nx-product .price { font-size: 24px; font-weight: 700; margin: 8px 0 12px; }
.nx-buy { display: inline-block; padding: 12px 28px; border-radius: 10px; background: var(--color-accent); color: white; text-decoration: none; }
.nx-buy-disabled { opacity: 0.5; cursor: not-allowed; }
</style>
<div class="nx-product">
  ${fields.image ? `<img src="${esc(fields.image)}" alt="${esc(fields.headings?.[0] || 'Product')}" />` : ''}
  <div class="nx-product-info">
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${fields.price ? `<div class="price">${esc(fields.price)}</div>` : ''}
    ${button}
  </div>
</div>`;
}

// Arbitrary inline JS on the published page -- see lib/sanitize.js's
// 'script' entry for why this is a bigger trust jump than every other
// block, and server.js's admin-only save gate for the resulting guard.
// No visual output; renders nothing in the page flow.
export function renderScript(fields) {
  const code = String(fields.code || '');
  // A literal `</script` inside the code (e.g. in a string or comment)
  // would otherwise close the tag early when parsed as HTML -- both by
  // the sanitizer and by the browser itself, silently truncating and
  // corrupting the script. `<\/script` is valid JS (an escaped slash) and
  // reads back identically at runtime.
  const safeCode = code.replace(/<\/script/gi, '<\\/script');
  return `<script>${safeCode}</script>`;
}

// Fixed column templates for the Layout block -- see catalog entries for
// the 5 seeded combinations (Two-column, Split Screen, Asymmetrical,
// Card/Block Grid, Featured). `fields.template` is set once at insert time
// and never changes afterward (changing column count later would require
// reflowing existing nested children, real complexity for little payoff --
// add a new Layout block and move children over instead).
export const LAYOUT_TEMPLATES = {
  'two-column': { label: 'Two-column', widths: [1, 1], gap: '24px' },
  'split-screen': { label: 'Split Screen', widths: [1, 1], gap: '0' },
  asymmetrical: { label: 'Asymmetrical', widths: [1, 2], gap: '24px' },
  grid: { label: 'Card/Block Grid', widths: [1, 1, 1], gap: '16px' },
  featured: { label: 'Featured', widths: [2, 1], gap: '24px' },
};

// Renders a Layout block: a row of columns, each holding zero or more
// nested blocks. Every nested block's `html` is already fully rendered and
// kept in sync with its own `fields` by the editor (see
// StructuredBlockEditor.jsx's LayoutBlockEditor) -- this just concatenates
// that already-rendered HTML inside each column's wrapper, no separate
// rendering pass needed. Falls back to the template's column count with
// empty columns if `fields.columns` is missing/short, so a hand-edited or
// stale catalog entry can't crash the renderer.
export function renderLayout(fields) {
  const template = LAYOUT_TEMPLATES[fields.template] || LAYOUT_TEMPLATES['two-column'];
  const columns = template.widths.map((_, i) => fields.columns?.[i] || { sections: [] });
  const colHtml = columns
    .map((col, i) => `<div class="nx-layout-col" style="flex: ${template.widths[i]} 1 260px; min-width: 0;">
${(col.sections || []).map((s) => s.html || '').join('\n')}
</div>`)
    .join('\n');
  return `<style>${BASE_STYLE}
.nx-layout { display: flex; flex-wrap: wrap; gap: ${template.gap}; align-items: flex-start; }
</style>
<div class="nx-layout">${colHtml}</div>`;
}

// ---------------------------------------------------------------------------
// Polished block set ("px-" prefix). A richer, general-purpose family added
// on top of the original plain "nx-" blocks -- modern layouts (split hero,
// image+text, feature tiles, steps, price list, stat band, pull quote, CTA
// band) inspired by the imported site templates. Every color uses a theme
// variable WITH a sensible fallback (e.g. var(--color-accent,#6366f1)) so the
// blocks look right both on a themed published page AND in the unthemed "Add
// Block +" preview. They consume the same standard field shapes (headings,
// text, images, links, items) as the rest of the catalog, so the structured
// editor edits them with no special-casing.

export function renderHeroSplit(fields) {
  const img = fields.images?.[0];
  const [primary, secondary] = fields.links || [];
  return `<style>
.px-hero-split { display:grid; grid-template-columns:1.1fr 1fr; gap:48px; align-items:center; max-width:1120px; margin:0 auto; padding:80px 24px; }
.px-hero-split .px-copy h1 { font-size:clamp(2rem,4.2vw,3.4rem); line-height:1.05; letter-spacing:-0.02em; margin:0 0 18px; }
.px-hero-split .px-copy p { color:var(--color-muted,#a1a1aa); font-size:1.1rem; line-height:1.6; margin:0 0 26px; max-width:48ch; }
.px-hero-split .px-actions { display:flex; flex-wrap:wrap; gap:12px; }
.px-hero-split .px-btn { display:inline-block; padding:13px 26px; border-radius:12px; text-decoration:none; font-weight:600; background:var(--color-accent,#6366f1); color:#fff; }
.px-hero-split .px-btn.px-ghost { background:transparent; border:1px solid rgba(127,127,127,0.35); color:var(--color-text,#e2e8f0); }
.px-hero-split .px-media { position:relative; }
.px-hero-split .px-media img { width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:20px; }
@media(max-width:760px){ .px-hero-split{ grid-template-columns:1fr; gap:28px; padding:52px 20px; } }
</style>
<div class="px-hero-split">
  <div class="px-copy">
    ${headingsHtml(fields.headings, 1)}
    ${textHtml(fields.text)}
    <div class="px-actions">
      ${primary ? `<a class="px-btn" href="${esc(primary.href || '#')}">${esc(primary.label || 'Get started')}</a>` : ''}
      ${secondary ? `<a class="px-btn px-ghost" href="${esc(secondary.href || '#')}">${esc(secondary.label || 'Learn more')}</a>` : ''}
    </div>
  </div>
  <div class="px-media">${img ? `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}" />` : ''}</div>
</div>`;
}

export function renderSplitContent(fields) {
  const img = fields.images?.[0];
  return `<style>
.px-split { display:grid; grid-template-columns:1fr 1fr; gap:44px; align-items:center; max-width:1080px; margin:0 auto; padding:56px 24px; }
.px-split .px-media img { width:100%; border-radius:18px; aspect-ratio:5/4; object-fit:cover; }
.px-split h2 { font-size:clamp(1.6rem,3vw,2.2rem); letter-spacing:-0.01em; margin:0 0 14px; }
.px-split p { color:var(--color-muted,#a1a1aa); line-height:1.65; margin:0 0 12px; }
.px-split a.px-link { color:var(--color-link,#a5b4fc); font-weight:600; text-decoration:none; }
@media(max-width:720px){ .px-split{ grid-template-columns:1fr; gap:28px; } .px-split .px-media{ order:-1; } }
</style>
<div class="px-split">
  <div class="px-media">${img ? `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}" />` : ''}</div>
  <div class="px-copy">
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${(fields.links || []).map((l) => `<a class="px-link" href="${esc(l.href || '#')}">${esc(l.label || 'Learn more')} →</a>`).join(' ')}
  </div>
</div>`;
}

export function renderFeatureIcons(fields) {
  const items = fields.items || [];
  return `<style>
.px-features { max-width:1080px; margin:0 auto; padding:60px 24px; }
.px-features .px-head { text-align:center; max-width:640px; margin:0 auto 40px; }
.px-features h2 { font-size:clamp(1.6rem,3vw,2.2rem); margin:0 0 10px; letter-spacing:-0.01em; }
.px-features .px-head p { color:var(--color-muted,#a1a1aa); margin:0; }
.px-feature-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; }
.px-feature { padding:26px; border-radius:16px; border:1px solid rgba(127,127,127,0.18); background:rgba(127,127,127,0.06); }
.px-feature .px-ico { width:46px; height:46px; border-radius:12px; display:grid; place-items:center; font-weight:700; color:#fff; background:linear-gradient(135deg,var(--color-accent,#6366f1),var(--color-secondary,#d946ef)); margin-bottom:16px; }
.px-feature h3 { margin:0 0 8px; font-size:1.1rem; }
.px-feature p { margin:0; color:var(--color-muted,#a1a1aa); font-size:.95rem; line-height:1.55; }
</style>
<div class="px-features">
  <div class="px-head">${headingsHtml(fields.headings, 2)}${textHtml(fields.text)}</div>
  <div class="px-feature-grid">
    ${items.map((it) => `<div class="px-feature">
      <div class="px-ico">${esc((it.heading || '•').trim().charAt(0).toUpperCase())}</div>
      <h3>${esc(it.heading)}</h3>
      <p>${esc(it.body)}</p>
    </div>`).join('')}
  </div>
</div>`;
}

export function renderSteps(fields) {
  const items = fields.items || [];
  return `<style>
.px-steps { max-width:900px; margin:0 auto; padding:60px 24px; }
.px-steps .px-head { margin-bottom:24px; }
.px-steps h2 { font-size:clamp(1.6rem,3vw,2.2rem); margin:0 0 10px; }
.px-step { display:flex; gap:20px; padding:22px 0; border-top:1px solid rgba(127,127,127,0.18); }
.px-step:first-of-type { border-top:0; }
.px-step .px-num { flex:none; width:44px; height:44px; border-radius:12px; display:grid; place-items:center; font-weight:700; color:var(--color-accent,#6366f1); border:1px solid rgba(127,127,127,0.28); }
.px-step h3 { margin:0 0 6px; }
.px-step p { margin:0; color:var(--color-muted,#a1a1aa); line-height:1.6; }
</style>
<div class="px-steps">
  <div class="px-head">${headingsHtml(fields.headings, 2)}${textHtml(fields.text)}</div>
  ${items.map((it, i) => `<div class="px-step">
    <div class="px-num">${String(i + 1).padStart(2, '0')}</div>
    <div><h3>${esc(it.heading)}</h3><p>${esc(it.body)}</p></div>
  </div>`).join('')}
</div>`;
}

export function renderPriceList(fields) {
  const items = fields.items || [];
  return `<style>
.px-pricelist { max-width:760px; margin:0 auto; padding:60px 24px; }
.px-pricelist h2 { text-align:center; margin:0 0 6px; font-size:clamp(1.6rem,3vw,2.2rem); }
.px-pricelist .px-sub { text-align:center; color:var(--color-muted,#a1a1aa); margin:0 0 28px; }
.px-price-row { display:grid; grid-template-columns:1fr auto; align-items:baseline; column-gap:16px; padding:16px 0; border-bottom:1px solid rgba(127,127,127,0.18); }
.px-price-row .px-name { font-weight:600; font-size:1.05rem; }
.px-price-row .px-price { font-weight:700; color:var(--color-accent,#6366f1); font-size:1.05rem; white-space:nowrap; }
.px-price-row .px-desc { grid-column:1 / -1; color:var(--color-muted,#a1a1aa); font-size:.9rem; margin-top:4px; }
</style>
<div class="px-pricelist">
  ${headingsHtml(fields.headings, 2)}
  ${(fields.text || []).map((t) => `<p class="px-sub">${esc(t)}</p>`).join('')}
  ${items.map((it) => `<div class="px-price-row">
    <span class="px-name">${esc(it.heading)}</span>
    <span class="px-price">${esc(it.meta)}</span>
    ${it.body ? `<span class="px-desc">${esc(it.body)}</span>` : ''}
  </div>`).join('')}
</div>`;
}

export function renderStatBand(fields) {
  const items = fields.items || [];
  return `<style>
.px-statband { max-width:1080px; margin:0 auto; padding:24px; }
.px-statband .px-inner { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:24px; padding:44px 28px; border-radius:22px; text-align:center; border:1px solid rgba(127,127,127,0.20); background:linear-gradient(135deg,rgba(99,102,241,0.16),rgba(217,70,239,0.10)); }
.px-statband .px-num { font-size:2.5rem; font-weight:800; letter-spacing:-0.02em; line-height:1; background:linear-gradient(135deg,var(--color-accent,#6366f1),var(--color-secondary,#d946ef)); -webkit-background-clip:text; background-clip:text; color:transparent; }
.px-statband .px-label { color:var(--color-muted,#a1a1aa); font-size:.9rem; margin-top:8px; }
</style>
<div class="px-statband"><div class="px-inner">
  ${items.map((it) => `<div><div class="px-num">${esc(it.heading)}</div><div class="px-label">${esc(it.body)}</div></div>`).join('')}
</div></div>`;
}

export function renderQuote(fields) {
  const person = (fields.items || [])[0] || {};
  const quote = (fields.text || [])[0] || (fields.headings || [])[0] || '';
  return `<style>
.px-quote { max-width:820px; margin:0 auto; padding:64px 24px; text-align:center; }
.px-quote .px-mark { font-size:3rem; line-height:.4; color:var(--color-accent,#6366f1); }
.px-quote blockquote { font-size:clamp(1.4rem,2.6vw,2rem); line-height:1.35; letter-spacing:-0.01em; font-weight:500; margin:12px 0 26px; }
.px-quote .px-author { display:flex; gap:12px; align-items:center; justify-content:center; }
.px-quote .px-author img { width:46px; height:46px; border-radius:50%; object-fit:cover; }
.px-quote .px-name { font-weight:600; }
.px-quote .px-role { color:var(--color-muted,#a1a1aa); font-size:.9rem; }
</style>
<div class="px-quote">
  <div class="px-mark">&ldquo;</div>
  <blockquote>${esc(quote)}</blockquote>
  <div class="px-author">
    ${person.image ? `<img src="${esc(person.image)}" alt="" />` : ''}
    <div style="text-align:left;">
      ${person.heading ? `<div class="px-name">${esc(person.heading)}</div>` : ''}
      ${person.meta ? `<div class="px-role">${esc(person.meta)}</div>` : ''}
    </div>
  </div>
</div>`;
}

export function renderCtaBand(fields) {
  return `<style>
.px-ctaband { max-width:1080px; margin:0 auto; padding:24px; }
.px-ctaband .px-inner { padding:56px 32px; border-radius:24px; text-align:center; color:#fff; background:linear-gradient(135deg,var(--color-accent,#6366f1),var(--color-secondary,#d946ef)); }
.px-ctaband h2 { font-size:clamp(1.7rem,3.4vw,2.6rem); letter-spacing:-0.02em; margin:0 0 12px; }
.px-ctaband p { opacity:.92; margin:0 0 26px; font-size:1.1rem; }
.px-ctaband a { display:inline-block; margin:6px; padding:14px 30px; border-radius:12px; background:#fff; color:#111; font-weight:700; text-decoration:none; }
</style>
<div class="px-ctaband"><div class="px-inner">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  ${(fields.links || []).map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || 'Get started')}</a>`).join('')}
</div></div>`;
}

export const BLOCK_RENDERERS = {
  header: renderHeader,
  navigation: renderNavigation,
  footer: renderFooter,
  hero: renderHero,
  cta: renderCta,
  feature: renderFeature,
  form: renderForm,
  content: renderContent,
  'card-grid': renderCardGrid,
  'scrolling-cards': renderScrollingCards,
  list: renderList,
  breadcrumb: renderBreadcrumb,
  banner: renderBanner,
  stats: renderStats,
  'logo-cloud': renderLogoCloud,
  testimonials: renderTestimonials,
  team: renderTeam,
  'pricing-table': renderPricingTable,
  newsletter: renderNewsletter,
  image: renderImage,
  gallery: renderGallery,
  video: renderVideo,
  faq: renderFaq,
  tabs: renderTabs,
  countdown: renderCountdown,
  'social-links': renderSocialLinks,
  product: renderProduct,
  script: renderScript,
  layout: renderLayout,
  // Polished block set
  'hero-split': renderHeroSplit,
  'split-content': renderSplitContent,
  'feature-icons': renderFeatureIcons,
  steps: renderSteps,
  'price-list': renderPriceList,
  'stat-band': renderStatBand,
  quote: renderQuote,
  'cta-band': renderCtaBand,
};

// Regenerates `html` from `fields` for a given blockType. Returns null for
// unknown/missing types so callers can fall back to raw HTML editing.
export function renderBlock(blockType, fields) {
  const renderer = BLOCK_RENDERERS[blockType];
  if (!renderer || !fields) return null;
  const html = renderer(fields);
  return fields.customCss ? `<style>\n${fields.customCss}\n</style>\n${html}` : html;
}
