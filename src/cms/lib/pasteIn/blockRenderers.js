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

// Loading strategy for every <img> the renderers emit.
//
// Below the fold, `loading="lazy"` is free performance: a 30-image gallery
// stops blocking the page on 30 requests. Above the fold it is actively
// harmful -- a lazy hero image is discovered late and tanks Largest
// Contentful Paint -- so the handful of renderers whose image IS the hero
// pass `eager` and get a priority hint instead. `decoding="async"` applies
// either way: it keeps image decode off the main thread.
const LAZY = 'loading="lazy" decoding="async"';
const EAGER = 'decoding="async" fetchpriority="high"';

import { FORM_FIELD_TYPES, formFieldsFor } from '../../../shared/formFields.js';
import {
  renderListingCards, renderListingSearch, renderListingHero,
  renderListingFacts, renderListingFeatures, renderMortgageCalc,
  renderPriceHistory, renderNearbySchools,
} from './listingRenderers.js';
import {
  renderNavLogo, renderNavCenter, renderNavUtility, renderNavOverlay, renderNavDrawer,
} from './navRenderers.js';
import { parseTourInput, TOUR_PROVIDER_NAMES } from '../../../shared/tourProviders.js';

const headingsHtml = (headings = [], startAt = 1) =>
  headings.map((h, i) => `<h${Math.min(startAt + i, 4)}>${esc(h)}</h${Math.min(startAt + i, 4)}>`).join('\n');

const textHtml = (text = []) => text.map((p) => `<p>${esc(p)}</p>`).join('\n');

const linksHtml = (links = [], className = 'nx-link') =>
  links.map((l) => `<a class="${className}" href="${esc(l.href || '#')}">${esc(l.label || l.href || 'Link')}</a>`).join('\n');

function itemCard(item) {
  return `<div class="nx-item">
  ${item.image ? `<img ${LAZY} src="${esc(item.image)}" alt="" />` : ''}
  ${item.heading ? `<h3>${esc(item.heading)}</h3>` : ''}
  ${item.meta ? `<div class="nx-item-meta">${esc(item.meta)}</div>` : ''}
  ${item.body ? `<p>${esc(item.body)}</p>` : ''}
  ${item.link ? `<a href="${esc(item.link)}">Learn more</a>` : ''}
</div>`;
}

const BASE_STYLE = `
.nx-item { border: 1px solid var(--border,rgba(255,255,255,0.1)); background: var(--surface,rgba(255,255,255,0.04)); border-radius: 14px; padding: 20px; }
.nx-item img { width: 100%; border-radius: 8px; margin-bottom: 12px; }
.nx-item-meta { font-size: 13px; color: var(--color-link); margin: -8px 0 8px; }
.nx-link { color: var(--color-link); text-decoration: none; }
.nx-fig { margin: 0; }
.nx-figcaption { margin-top: 8px; font-size: 13px; line-height: 1.45; }
.nx-figcaption .nx-cap-name { display: block; font-weight: 600; }
.nx-figcaption .nx-cap-alt { display: block; opacity: 0.8; }
.nx-figcaption .nx-cap-desc { display: block; opacity: 0.7; margin-top: 2px; }
`;

// Renders one image with an optional visible caption assembled from the
// per-placement show flags (showName / showAlt / showDescription). `alt` is
// always emitted as the accessibility attribute regardless of showAlt. When
// no flags are set this returns a bare <img>, byte-identical to the pre-
// caption output, so existing blocks and their layout CSS are unaffected.
export function imageWithCaption(img, imgAttrs = '') {
  if (!img || !img.src) return '';
  const tag = `<img ${LAZY} src="${esc(img.src)}" alt="${esc(img.alt || '')}"${imgAttrs ? ' ' + imgAttrs : ''} />`;
  const parts = [];
  if (img.showName && img.name) parts.push(`<span class="nx-cap-name">${esc(img.name)}</span>`);
  if (img.showAlt && img.alt) parts.push(`<span class="nx-cap-alt">${esc(img.alt)}</span>`);
  if (img.showDescription && img.description) parts.push(`<span class="nx-cap-desc">${esc(img.description)}</span>`);
  if (parts.length === 0) return tag;
  return `<figure class="nx-fig">${tag}<figcaption class="nx-figcaption">${parts.join('')}</figcaption></figure>`;
}

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
  <div>${headingsHtml((fields.headings || []).slice(0, 1))}</div>
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
.nx-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 24px; font-size: 14px; color: var(--color-muted); border-top: 1px solid var(--border,rgba(255,255,255,0.08)); }
</style>
<footer class="nx-footer">
  <div>${textHtml(fields.text)}</div>
  <div style="display:flex; gap:16px;">${linksHtml(fields.links)}</div>
</footer>`;
}

export function renderHero(fields) {
  return `<style>${BASE_STYLE}
.nx-hero { text-align: center; padding: 64px 24px; max-width: 720px; margin: 0 auto; }
.nx-hero .nx-cta { display: inline-block; margin-top: 20px; padding: 12px 24px; border-radius: 10px; background: var(--color-accent); color: var(--on-accent, #fff); text-decoration: none; }
</style>
<div class="nx-hero">
  ${headingsHtml(fields.headings, 1)}
  ${textHtml(fields.text)}
  ${fields.links?.[0] ? `<a class="nx-cta" href="${esc(fields.links[0].href || '#')}">${esc(fields.links[0].label || 'Learn more')}</a>` : ''}
</div>`;
}

export function renderCta(fields) {
  return `<style>${BASE_STYLE}
.nx-cta-section { text-align: center; padding: 48px 24px; max-width: 640px; margin: 0 auto; border: 1px solid var(--border,rgba(255,255,255,0.1)); background: var(--surface,rgba(255,255,255,0.04)); border-radius: 20px; }
.nx-cta-section a { display: inline-block; margin: 8px; padding: 11px 22px; border-radius: 10px; background: var(--color-accent); color: var(--on-accent, #fff); text-decoration: none; }
</style>
<div class="nx-cta-section">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  ${(fields.links || []).map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || 'Learn more')}</a>`).join('')}
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
.nx-form input, .nx-form textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border,rgba(255,255,255,0.15)); background: var(--surface,rgba(255,255,255,0.05)); color: var(--color-text); font: inherit; }
.nx-form button { margin-top: 16px; padding: 11px 22px; border-radius: 10px; border: 0; background: var(--color-accent); color: var(--on-accent, #fff); font: inherit; cursor: pointer; }
.nx-form .nx-hp { position: absolute; left: -9999px; }
`;

export function renderForm(fields) {
  // The form's own title travels with the submission, so a workspace running
  // several forms can tell them apart in the inbox instead of seeing a wall
  // of "Contact form".
  const formName = fields.headings?.[0] || 'Contact form';
  const control = (f, i) => {
    const id = `nx-f${i}`;
    const req = f.required ? ' required' : '';
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    if (f.type === 'textarea') {
      return `<textarea id="${id}" name="${esc(f.name)}" rows="4"${ph}${req}></textarea>`;
    }
    if (f.type === 'select') {
      const options = (f.options || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
      return `<select id="${id}" name="${esc(f.name)}"${req}><option value="">Choose…</option>${options}</select>`;
    }
    const inputType = FORM_FIELD_TYPES[f.type]?.input || 'text';
    return `<input type="${inputType}" id="${id}" name="${esc(f.name)}"${ph}${req} />`;
  };

  const controls = formFieldsFor(fields).map((f, i) => {
    const id = `nx-f${i}`;
    // A checkbox reads as "[x] I agree", not as a label stacked above a box.
    if (f.type === 'checkbox') {
      return `<label class="nx-check" for="${id}"><input type="checkbox" id="${id}" name="${esc(f.name)}" value="yes"${f.required ? ' required' : ''} /> ${esc(f.label)}</label>`;
    }
    return `<label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>\n    ${control(f, i)}`;
  }).join('\n    ');

  return `<style>${BASE_STYLE}${FORM_STYLE}
.nx-form .nx-check { display:flex; align-items:center; gap:8px; font-weight:400; }
.nx-form .nx-check input { width:auto; margin:0; }
.nx-form select { width:100%; }
</style>
<div class="nx-form">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  <form action="/api/public/forms" method="POST">
    <input type="hidden" name="_form" value="${esc(formName)}" />
    <input type="text" name="_hp" class="nx-hp" tabindex="-1" autocomplete="off" />
    ${controls}
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
  ${(fields.images || []).map((img) => `<img ${LAZY} src="${esc(img.src)}" alt="${esc(img.alt || '')}" style="max-width:100%; border-radius:8px;" />`).join('\n')}
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
.nx-breadcrumb a:hover { color: var(--color-text); }
.nx-breadcrumb span { color: var(--color-muted); opacity: 0.6; }
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
  ${fields.images?.[0] ? `<img ${EAGER} src="${esc(fields.images[0].src)}" alt="${esc(fields.images[0].alt || '')}" />` : ''}
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
<div class="nx-logo-cloud">${(fields.images || []).map((img) => `<img ${LAZY} src="${esc(img.src)}" alt="${esc(img.alt || '')}" />`).join('')}</div>`;
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
.nx-plan { border: 1px solid var(--border,rgba(255,255,255,0.1)); background: var(--surface,rgba(255,255,255,0.04)); border-radius: 16px; padding: 24px; }
.nx-plan.highlighted { border-color: rgba(217,70,239,0.5); background: var(--surface-strong,rgba(255,255,255,0.06)); }
.nx-plan .name { font-weight: 600; margin-bottom: 8px; }
.nx-plan .price { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
.nx-plan .period { font-size: 13px; color: var(--color-muted); }
.nx-plan ul { list-style: none; padding: 0; margin: 16px 0; font-size: 14px; color: var(--color-text); }
.nx-plan li { padding: 4px 0; }
.nx-plan a { display: block; text-align: center; padding: 10px; border-radius: 10px; background: var(--color-accent); color: var(--on-accent, #fff); text-decoration: none; margin-top: 12px; }
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
.nx-image-block .nx-figcaption { text-align: center; }
</style>
<div class="nx-image-block">${imageWithCaption(img)}</div>`;
}

export function renderGallery(fields) {
  return `<style>${BASE_STYLE}
.nx-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 24px; }
.nx-gallery img { width: 100%; height: 160px; object-fit: cover; border-radius: 10px; }
.nx-gallery .nx-fig img { margin: 0; }
</style>
${headingsHtml(fields.headings, 2)}
<div class="nx-gallery">${(fields.images || []).map((img) => imageWithCaption(img)).join('')}</div>`;
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
.nx-faq details { border: 1px solid var(--border,rgba(255,255,255,0.1)); background: var(--surface,rgba(255,255,255,0.04)); border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; }
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
.nx-tab-labels span { padding: 6px 14px; border-radius: 999px; background: var(--surface-strong,rgba(255,255,255,0.06)); border: 1px solid var(--border,rgba(255,255,255,0.1)); font-size: 13px; }
.nx-tab-panel { border: 1px solid var(--border,rgba(255,255,255,0.1)); background: var(--surface,rgba(255,255,255,0.04)); border-radius: 12px; padding: 18px; margin-bottom: 10px; }
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
.nx-social a { padding: 8px 16px; border-radius: 999px; background: var(--surface-strong,rgba(255,255,255,0.06)); border: 1px solid var(--border,rgba(255,255,255,0.1)); color: var(--color-text); text-decoration: none; font-size: 13px; }
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
.nx-buy { display: inline-block; padding: 12px 28px; border-radius: 10px; background: var(--color-accent); color: var(--on-accent, #fff); text-decoration: none; }
.nx-buy-disabled { opacity: 0.5; cursor: not-allowed; }
</style>
<div class="nx-product">
  ${fields.image ? `<img ${LAZY} src="${esc(fields.image)}" alt="${esc(fields.headings?.[0] || 'Product')}" />` : ''}
  <div class="nx-product-info">
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${fields.price ? `<div class="price">${esc(fields.price)}</div>` : ''}
    ${button}
  </div>
</div>`;
}

// Social Feed: recent posts from one connected account, shown on a public
// page. Deliberately renders only a no-JS placeholder -- the real cards are
// injected server-side at request time (see lib/social/feed.js), the same
// "server-fetch, static HTML" approach as the Product block, so it survives
// the strict public CSP with no embed scripts. In the editor preview it
// shows a labelled placeholder (like the Contact Form / Newsletter blocks),
// since the live feed only exists on the published page.
export function renderSocialFeed(fields) {
  const platform = esc(fields.platform || 'ig');
  const limit = Math.min(12, Math.max(1, Number(fields.limit) || 6));
  const heading = esc(fields.headings?.[0] || '');
  return `<div class="nx-social-feed" data-platform="${platform}" data-limit="${limit}" data-heading="${heading}">
  <p style="text-align:center;color:#64748b;font-size:14px;padding:24px">Social feed (${platform.toUpperCase()}) — live posts appear on the published page.</p>
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
.px-hero-split .px-btn { display:inline-block; padding:13px 26px; border-radius:12px; text-decoration:none; font-weight:600; background:var(--color-accent,#6366f1); color:var(--on-accent,#fff); }
.px-hero-split .px-btn.px-ghost { background:transparent; border:1px solid var(--border,rgba(127,127,127,0.35)); color:var(--color-text,#e2e8f0); }
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
  <div class="px-media">${img ? `<img ${EAGER} src="${esc(img.src)}" alt="${esc(img.alt || '')}" />` : ''}</div>
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
  <div class="px-media">${img ? `<img ${EAGER} src="${esc(img.src)}" alt="${esc(img.alt || '')}" />` : ''}</div>
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
.px-feature { padding:26px; border-radius:16px; border:1px solid var(--border,rgba(127,127,127,0.18)); background:var(--surface,rgba(127,127,127,0.06)); }
.px-feature .px-ico { width:46px; height:46px; border-radius:12px; display:grid; place-items:center; font-weight:700; color:var(--on-accent,#fff); background:linear-gradient(135deg,var(--color-accent,#6366f1),var(--color-secondary,#d946ef)); margin-bottom:16px; }
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
.px-step { display:flex; gap:20px; padding:22px 0; border-top:1px solid var(--border,rgba(127,127,127,0.18)); }
.px-step:first-of-type { border-top:0; }
.px-step .px-num { flex:none; width:44px; height:44px; border-radius:12px; display:grid; place-items:center; font-weight:700; color:var(--color-accent,#6366f1); border:1px solid var(--border,rgba(127,127,127,0.28)); }
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
.px-price-row { display:grid; grid-template-columns:1fr auto; align-items:baseline; column-gap:16px; padding:16px 0; border-bottom:1px solid var(--border,rgba(127,127,127,0.18)); }
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
.px-statband .px-inner { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:24px; padding:44px 28px; border-radius:22px; text-align:center; border:1px solid var(--border,rgba(127,127,127,0.20)); background:var(--accent-soft,rgba(99,102,241,0.14)); }
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
    ${person.image ? `<img ${LAZY} src="${esc(person.image)}" alt="" />` : ''}
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
.px-ctaband .px-inner { padding:56px 32px; border-radius:24px; text-align:center; color:var(--on-accent,#fff); background:linear-gradient(135deg,var(--color-accent,#6366f1),var(--color-secondary,#d946ef)); }
.px-ctaband h2 { font-size:clamp(1.7rem,3.4vw,2.6rem); letter-spacing:-0.02em; margin:0 0 12px; }
.px-ctaband p { opacity:.92; margin:0 0 26px; font-size:1.1rem; }
.px-ctaband a { display:inline-block; margin:6px; padding:14px 30px; border-radius:12px; background:var(--on-accent,#fff); color:var(--color-accent,#6366f1); font-weight:700; text-decoration:none; }
</style>
<div class="px-ctaband"><div class="px-inner">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  ${(fields.links || []).map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || 'Get started')}</a>`).join('')}
</div></div>`;
}

// --- Expanded polished set: more ready-made section variations ---------------

export function renderHeroCentered(fields) {
  const img = fields.images?.[0];
  return `<style>
.px-heroc { max-width:840px; margin:0 auto; padding:88px 24px; text-align:center; }
.px-heroc h1 { font-size:clamp(2.2rem,5vw,3.6rem); line-height:1.05; letter-spacing:-0.02em; margin:0 0 18px; }
.px-heroc p { color:var(--color-muted,#a1a1aa); font-size:1.15rem; line-height:1.6; margin:0 auto 26px; max-width:52ch; }
.px-heroc .px-actions a { display:inline-block; margin:6px; padding:13px 28px; border-radius:12px; text-decoration:none; font-weight:600; }
.px-heroc .px-actions a:first-child { background:var(--color-accent,#6366f1); color:var(--on-accent,#fff); }
.px-heroc .px-actions a+a { border:1px solid var(--border,rgba(127,127,127,0.25)); color:var(--color-text,#e2e8f0); }
.px-heroc .px-media { margin-top:44px; }
.px-heroc .px-media img { width:100%; border-radius:20px; }
</style>
<div class="px-heroc">
  ${headingsHtml(fields.headings, 1)}
  ${textHtml(fields.text)}
  <div class="px-actions">${(fields.links || []).map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || 'Learn more')}</a>`).join('')}</div>
  ${img ? `<div class="px-media"><img ${EAGER} src="${esc(img.src)}" alt="${esc(img.alt || '')}" /></div>` : ''}
</div>`;
}

export function renderAnnouncement(fields) {
  const link = fields.links?.[0];
  return `<style>
.px-announce { background:var(--color-accent,#6366f1); color:var(--on-accent,#fff); text-align:center; padding:10px 16px; font-size:.92rem; }
.px-announce a { color:var(--on-accent,#fff); font-weight:700; text-decoration:underline; margin-left:6px; }
</style>
<div class="px-announce">${esc((fields.text || [])[0] || '')}${link ? `<a href="${esc(link.href || '#')}">${esc(link.label || 'Learn more')} →</a>` : ''}</div>`;
}

export function renderChecklist(fields) {
  const items = fields.items || [];
  return `<style>
.px-checklist { max-width:900px; margin:0 auto; padding:56px 24px; }
.px-checklist .px-head { text-align:center; margin-bottom:32px; }
.px-checklist h2 { font-size:clamp(1.6rem,3vw,2.2rem); margin:0 0 8px; }
.px-check-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px 32px; }
.px-check { display:flex; gap:12px; align-items:flex-start; }
.px-check .px-tick { flex:none; width:24px; height:24px; border-radius:50%; display:grid; place-items:center; background:var(--accent-soft,rgba(99,102,241,0.14)); color:var(--color-accent,#6366f1); font-weight:800; font-size:.75rem; }
.px-check .px-t { font-weight:600; }
.px-check .px-d { color:var(--color-muted,#a1a1aa); font-size:.9rem; margin-top:2px; }
</style>
<div class="px-checklist">
  <div class="px-head">${headingsHtml(fields.headings, 2)}${textHtml(fields.text)}</div>
  <div class="px-check-grid">
    ${items.map((it) => `<div class="px-check"><span class="px-tick">✓</span><div><div class="px-t">${esc(it.heading)}</div>${it.body ? `<div class="px-d">${esc(it.body)}</div>` : ''}</div></div>`).join('')}
  </div>
</div>`;
}

export function renderFeatureRows(fields) {
  const items = fields.items || [];
  return `<style>
.px-frows { max-width:1040px; margin:0 auto; padding:40px 24px; }
.px-frow { display:grid; grid-template-columns:1fr 1fr; gap:44px; align-items:center; padding:32px 0; }
.px-frow:nth-of-type(even) .px-media { order:2; }
.px-frow .px-media img { width:100%; border-radius:16px; aspect-ratio:4/3; object-fit:cover; }
.px-frow h3 { font-size:clamp(1.3rem,2.4vw,1.7rem); margin:0 0 10px; letter-spacing:-0.01em; }
.px-frow p { color:var(--color-muted,#a1a1aa); line-height:1.65; margin:0; }
@media(max-width:720px){ .px-frow{ grid-template-columns:1fr; gap:20px; } .px-frow .px-media{ order:-1 !important; } }
</style>
<div class="px-frows">
  ${items.map((it) => `<div class="px-frow">
    <div class="px-media">${it.image ? `<img ${LAZY} src="${esc(it.image)}" alt="" />` : ''}</div>
    <div><h3>${esc(it.heading)}</h3><p>${esc(it.body)}</p></div>
  </div>`).join('')}
</div>`;
}

export function renderMetricCards(fields) {
  const items = fields.items || [];
  return `<style>
.px-metrics { max-width:1080px; margin:0 auto; padding:56px 24px; }
.px-metrics .px-head { text-align:center; margin-bottom:32px; }
.px-metric-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:16px; }
.px-metric { padding:26px; border-radius:16px; border:1px solid var(--border,rgba(127,127,127,0.18)); background:var(--surface,rgba(127,127,127,0.05)); }
.px-metric .px-n { font-size:2.2rem; font-weight:800; letter-spacing:-0.02em; color:var(--color-accent,#6366f1); }
.px-metric .px-l { font-weight:600; margin-top:4px; }
.px-metric .px-s { color:var(--color-muted,#a1a1aa); font-size:.9rem; margin-top:4px; }
</style>
<div class="px-metrics">
  <div class="px-head">${headingsHtml(fields.headings, 2)}</div>
  <div class="px-metric-grid">
    ${items.map((it) => `<div class="px-metric"><div class="px-n">${esc(it.heading)}</div><div class="px-l">${esc(it.body)}</div>${it.meta ? `<div class="px-s">${esc(it.meta)}</div>` : ''}</div>`).join('')}
  </div>
</div>`;
}

export function renderPricingCards(fields) {
  const plans = fields.plans || [];
  return `<style>
.px-pricing { max-width:1080px; margin:0 auto; padding:56px 24px; }
.px-pricing .px-head { text-align:center; margin-bottom:36px; }
.px-pricing-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:18px; align-items:stretch; }
.px-plan { display:flex; flex-direction:column; padding:28px; border-radius:18px; border:1px solid var(--border,rgba(127,127,127,0.18)); background:var(--surface,rgba(127,127,127,0.04)); }
.px-plan.px-hot { border-color:var(--color-accent,#6366f1); box-shadow:0 0 0 1px var(--color-accent,#6366f1) inset; position:relative; }
.px-plan .px-badge { position:absolute; top:-11px; left:50%; transform:translateX(-50%); background:var(--color-accent,#6366f1); color:var(--on-accent,#fff); font-size:.7rem; font-weight:700; padding:4px 12px; border-radius:999px; letter-spacing:.04em; }
.px-plan .px-name { font-weight:700; }
.px-plan .px-price { font-size:2.4rem; font-weight:800; letter-spacing:-0.02em; margin:8px 0 2px; }
.px-plan .px-per { color:var(--color-muted,#a1a1aa); font-size:.9rem; }
.px-plan ul { list-style:none; padding:0; margin:18px 0; display:flex; flex-direction:column; gap:9px; font-size:.95rem; }
.px-plan li { display:flex; gap:8px; }
.px-plan li::before { content:"✓"; color:var(--color-accent,#6366f1); font-weight:800; }
.px-plan a { margin-top:auto; text-align:center; padding:12px; border-radius:12px; text-decoration:none; font-weight:600; background:var(--color-accent,#6366f1); color:var(--on-accent,#fff); }
.px-plan:not(.px-hot) a { background:var(--surface-strong,rgba(127,127,127,0.1)); color:var(--color-text,#e2e8f0); border:1px solid var(--border,rgba(127,127,127,0.2)); }
</style>
<div class="px-pricing">
  <div class="px-head">${headingsHtml(fields.headings, 2)}${textHtml(fields.text)}</div>
  <div class="px-pricing-grid">
    ${plans.map((p) => `<div class="px-plan${p.highlighted ? ' px-hot' : ''}">
      ${p.highlighted ? '<span class="px-badge">Most popular</span>' : ''}
      <div class="px-name">${esc(p.name)}</div>
      <div class="px-price">${esc(p.price)}<span class="px-per"> ${esc(p.period || '')}</span></div>
      <ul>${(p.features || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <a href="${esc(p.ctaHref || '#')}">${esc(p.ctaLabel || 'Choose plan')}</a>
    </div>`).join('')}
  </div>
</div>`;
}

export function renderTestimonialGrid(fields) {
  const items = fields.items || [];
  return `<style>
.px-tgrid { max-width:1080px; margin:0 auto; padding:56px 24px; }
.px-tgrid .px-head { text-align:center; margin-bottom:32px; }
.px-tgrid-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:18px; }
.px-tcard { padding:26px; border-radius:16px; border:1px solid var(--border,rgba(127,127,127,0.18)); background:var(--surface,rgba(127,127,127,0.05)); }
.px-tcard .px-stars { color:var(--color-accent,#6366f1); letter-spacing:2px; margin-bottom:12px; }
.px-tcard .px-body { line-height:1.6; margin:0 0 18px; }
.px-tcard .px-who { display:flex; gap:12px; align-items:center; }
.px-tcard .px-who img { width:42px; height:42px; border-radius:50%; object-fit:cover; }
.px-tcard .px-name { font-weight:600; }
.px-tcard .px-role { color:var(--color-muted,#a1a1aa); font-size:.85rem; }
</style>
<div class="px-tgrid">
  <div class="px-head">${headingsHtml(fields.headings, 2)}</div>
  <div class="px-tgrid-grid">
    ${items.map((it) => `<div class="px-tcard">
      <div class="px-stars">★★★★★</div>
      <p class="px-body">${esc(it.body)}</p>
      <div class="px-who">${it.image ? `<img ${LAZY} src="${esc(it.image)}" alt="" />` : ''}<div><div class="px-name">${esc(it.heading)}</div>${it.meta ? `<div class="px-role">${esc(it.meta)}</div>` : ''}</div></div>
    </div>`).join('')}
  </div>
</div>`;
}

export function renderTeamGrid(fields) {
  const items = fields.items || [];
  return `<style>
.px-team { max-width:1080px; margin:0 auto; padding:56px 24px; }
.px-team .px-head { text-align:center; margin-bottom:32px; }
.px-team-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; }
.px-tm { text-align:center; }
.px-tm img { width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:16px; margin-bottom:12px; }
.px-tm .px-name { font-weight:600; }
.px-tm .px-role { color:var(--color-accent,#6366f1); font-size:.85rem; }
.px-tm .px-bio { color:var(--color-muted,#a1a1aa); font-size:.9rem; margin-top:6px; }
</style>
<div class="px-team">
  <div class="px-head">${headingsHtml(fields.headings, 2)}</div>
  <div class="px-team-grid">
    ${items.map((it) => `<div class="px-tm">${it.image ? `<img ${LAZY} src="${esc(it.image)}" alt="${esc(it.heading || '')}" />` : ''}<div class="px-name">${esc(it.heading)}</div>${it.meta ? `<div class="px-role">${esc(it.meta)}</div>` : ''}${it.body ? `<div class="px-bio">${esc(it.body)}</div>` : ''}</div>`).join('')}
  </div>
</div>`;
}

export function renderFaqAccordion(fields) {
  const items = fields.items || [];
  return `<style>
.px-faq { max-width:760px; margin:0 auto; padding:56px 24px; }
.px-faq h2 { text-align:center; margin:0 0 28px; font-size:clamp(1.6rem,3vw,2.2rem); }
.px-faq details { border:1px solid var(--border,rgba(127,127,127,0.18)); border-radius:14px; padding:16px 20px; margin-bottom:10px; background:var(--surface,rgba(127,127,127,0.04)); }
.px-faq summary { cursor:pointer; font-weight:600; list-style:none; display:flex; justify-content:space-between; align-items:center; }
.px-faq summary::-webkit-details-marker { display:none; }
.px-faq summary::after { content:"+"; color:var(--color-accent,#6366f1); font-size:1.4rem; font-weight:400; line-height:1; }
.px-faq details[open] summary::after { content:"–"; }
.px-faq p { margin:12px 0 0; color:var(--color-muted,#a1a1aa); line-height:1.6; }
</style>
<div class="px-faq">
  ${headingsHtml(fields.headings, 2)}
  ${items.map((it) => `<details><summary>${esc(it.heading)}</summary><p>${esc(it.body)}</p></details>`).join('')}
</div>`;
}

export function renderContactSplit(fields) {
  return `<style>${FORM_STYLE}
.px-contact { display:grid; grid-template-columns:1fr 1fr; gap:44px; max-width:1000px; margin:0 auto; padding:56px 24px; align-items:start; }
.px-contact h2 { font-size:clamp(1.6rem,3vw,2.2rem); margin:0 0 12px; }
.px-contact .px-info p { color:var(--color-muted,#a1a1aa); line-height:1.6; }
.px-contact .px-info a { display:block; color:var(--color-link,#a5b4fc); text-decoration:none; margin-top:6px; }
.px-contact .nx-form { margin:0; padding:0; max-width:none; }
@media(max-width:720px){ .px-contact{ grid-template-columns:1fr; gap:28px; } }
</style>
<div class="px-contact">
  <div class="px-info">
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${(fields.links || []).map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || l.href)}</a>`).join('')}
  </div>
  <div class="nx-form">
    <form action="/api/public/forms" method="POST">
      <input type="hidden" name="_form" value="Contact form" />
      <input type="text" name="_hp" class="nx-hp" tabindex="-1" autocomplete="off" />
      <label for="pxc-name">Name</label>
      <input type="text" id="pxc-name" name="name" required />
      <label for="pxc-email">Email</label>
      <input type="email" id="pxc-email" name="email" required />
      <label for="pxc-msg">Message</label>
      <textarea id="pxc-msg" name="message" rows="4" required></textarea>
      <button type="submit">Send message</button>
    </form>
  </div>
</div>`;
}

export function renderGalleryMasonry(fields) {
  const images = fields.images || [];
  return `<style>
.px-masonry-wrap { max-width:1100px; margin:0 auto; padding:40px 24px; }
.px-masonry-wrap h2 { text-align:center; margin:0 0 24px; }
.px-masonry { column-count:3; column-gap:14px; }
.px-masonry img { width:100%; margin:0 0 14px; border-radius:12px; break-inside:avoid; display:block; }
.px-masonry .nx-fig { break-inside:avoid; margin:0 0 14px; }
.px-masonry .nx-fig img { margin:0; }
.px-masonry .nx-figcaption { font-size:13px; line-height:1.45; margin-top:8px; }
.px-masonry .nx-cap-name { display:block; font-weight:600; }
.px-masonry .nx-cap-alt { display:block; opacity:0.8; }
.px-masonry .nx-cap-desc { display:block; opacity:0.7; margin-top:2px; }
@media(max-width:820px){ .px-masonry{ column-count:2; } }
@media(max-width:480px){ .px-masonry{ column-count:1; } }
</style>
<div class="px-masonry-wrap">
  ${headingsHtml(fields.headings, 2)}
  <div class="px-masonry">${images.map((im) => imageWithCaption(im)).join('')}</div>
</div>`;
}

export function renderCtaSplit(fields) {
  const link = fields.links?.[0];
  return `<style>
.px-ctasplit { max-width:1080px; margin:0 auto; padding:24px; }
.px-ctasplit .px-inner { display:flex; flex-wrap:wrap; gap:20px; align-items:center; justify-content:space-between; padding:36px 32px; border-radius:20px; background:var(--accent-soft,rgba(99,102,241,0.12)); border:1px solid var(--border,rgba(127,127,127,0.18)); }
.px-ctasplit h2 { margin:0 0 4px; font-size:clamp(1.4rem,2.6vw,1.9rem); }
.px-ctasplit p { margin:0; color:var(--color-muted,#a1a1aa); }
.px-ctasplit a { flex:none; padding:14px 30px; border-radius:12px; background:var(--color-accent,#6366f1); color:var(--on-accent,#fff); font-weight:700; text-decoration:none; }
</style>
<div class="px-ctasplit"><div class="px-inner">
  <div>${headingsHtml(fields.headings, 2)}${textHtml(fields.text)}</div>
  ${link ? `<a href="${esc(link.href || '#')}">${esc(link.label || 'Get started')}</a>` : ''}
</div></div>`;
}

export function renderBlogCards(fields) {
  const items = fields.items || [];
  return `<style>
.px-blog { max-width:1080px; margin:0 auto; padding:56px 24px; }
.px-blog .px-head { margin-bottom:28px; }
.px-blog-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; }
.px-post { border-radius:16px; overflow:hidden; border:1px solid var(--border,rgba(127,127,127,0.18)); background:var(--surface,rgba(127,127,127,0.04)); display:flex; flex-direction:column; }
.px-post img { width:100%; aspect-ratio:16/9; object-fit:cover; }
.px-post .px-body { padding:20px; display:flex; flex-direction:column; gap:8px; flex:1; }
.px-post .px-meta { color:var(--color-accent,#6366f1); font-size:.8rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.px-post h3 { margin:0; font-size:1.15rem; }
.px-post p { margin:0; color:var(--color-muted,#a1a1aa); font-size:.95rem; line-height:1.55; flex:1; }
.px-post a { color:var(--color-link,#a5b4fc); font-weight:600; text-decoration:none; }
</style>
<div class="px-blog">
  <div class="px-head">${headingsHtml(fields.headings, 2)}</div>
  <div class="px-blog-grid">
    ${items.map((it) => `<div class="px-post">
      ${it.image ? `<img ${LAZY} src="${esc(it.image)}" alt="" />` : ''}
      <div class="px-body">
        ${it.meta ? `<div class="px-meta">${esc(it.meta)}</div>` : ''}
        <h3>${esc(it.heading)}</h3>
        <p>${esc(it.body)}</p>
        ${it.link ? `<a href="${esc(it.link)}">Read more →</a>` : ''}
      </div>
    </div>`).join('')}
  </div>
</div>`;
}

export function renderBannerImage(fields) {
  const img = fields.images?.[0];
  const link = fields.links?.[0];
  return `<style>
.px-bannerimg { position:relative; max-width:1120px; margin:24px auto; min-height:360px; display:grid; place-items:center; text-align:center; border-radius:20px; overflow:hidden; padding:48px 24px; }
.px-bannerimg > img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.px-bannerimg::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,0.3),rgba(0,0,0,0.6)); z-index:1; }
.px-bannerimg .px-inner { position:relative; z-index:2; color:#fff; max-width:640px; }
.px-bannerimg h2 { font-size:clamp(1.8rem,4vw,2.8rem); margin:0 0 12px; letter-spacing:-0.02em; }
.px-bannerimg p { opacity:.92; margin:0 0 22px; font-size:1.1rem; }
.px-bannerimg a { display:inline-block; padding:13px 28px; border-radius:12px; background:#fff; color:#111; font-weight:700; text-decoration:none; }
</style>
<div class="px-bannerimg">
  ${img ? `<img ${EAGER} src="${esc(img.src)}" alt="${esc(img.alt || '')}" />` : ''}
  <div class="px-inner">
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${link ? `<a href="${esc(link.href || '#')}">${esc(link.label || 'Learn more')}</a>` : ''}
  </div>
</div>`;
}

// --- Parallax + video --------------------------------------------------------

// CSS-only parallax: a fixed background image with content on top. No
// JavaScript (works under the published-page CSP as-is). background-attachment
// gracefully degrades to a normal scroll on mobile browsers that ignore it.
export function renderParallax(fields) {
  const img = fields.images?.[0];
  const link = fields.links?.[0];
  const items = fields.items || [];
  return `<style>
.px-parallax { position:relative; min-height:420px; display:grid; place-items:center; text-align:center; padding:80px 24px; color:#fff; background-image:linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.55))${img ? `,url('${esc(img.src)}')` : ''}; background-size:cover; background-position:center; background-attachment:fixed; }
.px-parallax .px-inner { max-width:720px; }
.px-parallax h2 { font-size:clamp(1.9rem,4vw,3rem); letter-spacing:-0.02em; margin:0 0 14px; }
.px-parallax p { opacity:.92; font-size:1.15rem; line-height:1.6; margin:0 0 22px; }
.px-parallax a { display:inline-block; padding:13px 28px; border-radius:12px; background:#fff; color:#111; font-weight:700; text-decoration:none; }
.px-parallax .px-stats { display:flex; flex-wrap:wrap; gap:36px; justify-content:center; margin-top:8px; }
.px-parallax .px-stat .px-n { font-size:2.4rem; font-weight:800; letter-spacing:-0.02em; }
.px-parallax .px-stat .px-l { opacity:.85; font-size:.9rem; }
</style>
<div class="px-parallax"><div class="px-inner">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  ${items.length ? `<div class="px-stats">${items.map((it) => `<div class="px-stat"><div class="px-n">${esc(it.heading)}</div><div class="px-l">${esc(it.body)}</div></div>`).join('')}</div>` : ''}
  ${link ? `<a href="${esc(link.href || '#')}">${esc(link.label || 'Learn more')}</a>` : ''}
</div></div>`;
}

// Full-bleed background video hero. Uses a native muted+loop+autoplay <video>
// (allowed by the sanitizer; external mp4s allowed by the CSP's media-src).
// `images[0]` is the poster, shown before the video loads and as a graceful
// fallback when no videoUrl is set.
export function renderVideoBg(fields) {
  const poster = fields.images?.[0];
  const link = fields.links?.[0];
  const src = fields.videoUrl ? esc(fields.videoUrl) : '';
  return `<style>
.px-videobg { position:relative; min-height:460px; display:grid; place-items:center; text-align:center; padding:80px 24px; overflow:hidden; border-radius:0; color:#fff; }
.px-videobg video, .px-videobg .px-poster { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.px-videobg::after { content:""; position:absolute; inset:0; background:linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.6)); z-index:1; }
.px-videobg .px-inner { position:relative; z-index:2; max-width:720px; }
.px-videobg h2 { font-size:clamp(2rem,4.4vw,3.2rem); letter-spacing:-0.02em; margin:0 0 14px; }
.px-videobg p { opacity:.92; font-size:1.15rem; line-height:1.6; margin:0 0 22px; }
.px-videobg a { display:inline-block; padding:13px 28px; border-radius:12px; background:#fff; color:#111; font-weight:700; text-decoration:none; }
</style>
<div class="px-videobg">
  ${src
    ? `<video autoplay muted loop playsinline ${poster ? `poster="${esc(poster.src)}"` : ''}><source src="${src}" type="video/mp4" /></video>`
    : (poster ? `<img class="px-poster" ${EAGER} src="${esc(poster.src)}" alt="${esc(poster.alt || '')}" />` : '')}
  <div class="px-inner">
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${link ? `<a href="${esc(link.href || '#')}">${esc(link.label || 'Watch')}</a>` : ''}
  </div>
</div>`;
}

// Video (YouTube/Vimeo embed) beside a heading + copy + link. Reuses
// toEmbedUrl so a normal watch/share URL works. Embeds are already allowed by
// the CSP's frame-src.
export function renderVideoSplit(fields) {
  const embed = fields.videoUrl ? esc(toEmbedUrl(fields.videoUrl)) : '';
  return `<style>
.px-vsplit { display:grid; grid-template-columns:1.1fr 1fr; gap:44px; align-items:center; max-width:1080px; margin:0 auto; padding:56px 24px; }
.px-vsplit h2 { font-size:clamp(1.6rem,3vw,2.3rem); letter-spacing:-0.01em; margin:0 0 14px; }
.px-vsplit p { color:var(--color-muted,#a1a1aa); line-height:1.65; margin:0 0 18px; }
.px-vsplit a { color:var(--color-link,#a5b4fc); font-weight:600; text-decoration:none; }
.px-vsplit .px-frame { position:relative; padding-bottom:56.25%; height:0; border-radius:16px; overflow:hidden; background:var(--surface,rgba(127,127,127,0.08)); }
.px-vsplit .px-frame iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
@media(max-width:760px){ .px-vsplit{ grid-template-columns:1fr; gap:24px; } }
</style>
<div class="px-vsplit">
  <div>
    ${headingsHtml(fields.headings, 2)}
    ${textHtml(fields.text)}
    ${(fields.links || []).map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || 'Learn more')} →</a>`).join(' ')}
  </div>
  <div class="px-frame">${embed ? `<iframe src="${embed}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` : ''}</div>
</div>`;
}

// --- Events, sliders, marquees -----------------------------------------------

// A clean agenda of upcoming events. Each item: meta = the date/time chip
// text (e.g. "Fri, Aug 12 · 7pm"), heading = title, body = venue/details,
// optional link = ticket/details URL.
export function renderEventsList(fields) {
  const items = fields.items || [];
  return `<style>
.px-events { max-width:820px; margin:0 auto; padding:56px 24px; }
.px-events .px-head { margin-bottom:24px; }
.px-events h2 { font-size:clamp(1.6rem,3vw,2.2rem); margin:0 0 8px; }
.px-event { display:grid; grid-template-columns:auto 1fr auto; gap:18px; align-items:center; padding:18px 0; border-top:1px solid var(--border,rgba(127,127,127,0.18)); }
.px-event:first-of-type { border-top:0; }
.px-event .px-date { min-width:96px; text-align:center; padding:10px 12px; border-radius:12px; background:var(--accent-soft,rgba(99,102,241,0.12)); color:var(--color-accent,#6366f1); font-weight:700; font-size:.9rem; line-height:1.2; }
.px-event .px-title { font-weight:600; font-size:1.1rem; }
.px-event .px-meta { color:var(--color-muted,#a1a1aa); font-size:.92rem; margin-top:2px; }
.px-event a { flex:none; padding:9px 18px; border-radius:10px; background:var(--color-accent,#6366f1); color:var(--on-accent,#fff); text-decoration:none; font-weight:600; font-size:.9rem; white-space:nowrap; }
@media(max-width:560px){ .px-event{ grid-template-columns:auto 1fr; } .px-event a{ grid-column:2; justify-self:start; } }
</style>
<div class="px-events">
  <div class="px-head">${headingsHtml(fields.headings, 2)}${textHtml(fields.text)}</div>
  ${items.map((it) => `<div class="px-event">
    <div class="px-date">${esc(it.meta || 'TBD')}</div>
    <div><div class="px-title">${esc(it.heading)}</div>${it.body ? `<div class="px-meta">${esc(it.body)}</div>` : ''}</div>
    ${it.link ? `<a href="${esc(it.link)}">Details</a>` : ''}
  </div>`).join('')}
</div>`;
}

// A month calendar. `month` is "YYYY-MM" (defaults to the first event's month,
// else today's). Events are items whose meta is a "YYYY-MM-DD" date; matching
// days are highlighted and listed in the agenda below the grid.
export function renderCalendar(fields) {
  const items = fields.items || [];
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null; };
  const events = items.map((it) => ({ ...it, date: parse(it.meta) })).filter((e) => e.date);
  const mm = /^(\d{4})-(\d{2})/.exec(String(fields.month || ''));
  const base = mm ? { y: +mm[1], mo: +mm[2] } : (events[0]?.date || (() => { const n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() + 1 }; })());
  const first = new Date(base.y, base.mo - 1, 1);
  const startDow = first.getDay();
  const daysIn = new Date(base.y, base.mo, 0).getDate();
  const monthName = first.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const byDay = {};
  for (const e of events) if (e.date.y === base.y && e.date.mo === base.mo) (byDay[e.date.d] ||= []).push(e.heading);
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<div class="px-cell px-empty"></div>');
  for (let d = 1; d <= daysIn; d++) {
    const has = byDay[d];
    cells.push(`<div class="px-cell${has ? ' px-has' : ''}"><span class="px-d">${d}</span>${has ? `<span class="px-dot"></span><span class="px-ev">${esc(has[0])}</span>` : ''}</div>`);
  }
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `<style>
.px-cal { max-width:860px; margin:0 auto; padding:48px 24px; }
.px-cal .px-calhead { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
.px-cal h2 { margin:0; font-size:clamp(1.4rem,2.6vw,1.9rem); }
.px-cal .px-month { color:var(--color-accent,#6366f1); font-weight:700; }
.px-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
.px-dow { text-align:center; font-size:.72rem; text-transform:uppercase; letter-spacing:.04em; color:var(--color-muted,#a1a1aa); padding:4px 0; }
.px-cell { min-height:74px; border:1px solid var(--border,rgba(127,127,127,0.16)); border-radius:10px; padding:6px 8px; position:relative; background:var(--surface,rgba(127,127,127,0.03)); }
.px-cell.px-empty { border:0; background:transparent; }
.px-cell .px-d { font-size:.8rem; color:var(--color-muted,#a1a1aa); }
.px-cell.px-has { background:var(--accent-soft,rgba(99,102,241,0.12)); border-color:var(--color-accent,#6366f1); }
.px-cell.px-has .px-d { color:var(--color-text,#e2e8f0); font-weight:700; }
.px-cell .px-dot { position:absolute; top:8px; right:8px; width:7px; height:7px; border-radius:50%; background:var(--color-accent,#6366f1); }
.px-cell .px-ev { display:block; margin-top:4px; font-size:.72rem; line-height:1.2; overflow:hidden; }
.px-agenda { margin-top:20px; display:flex; flex-direction:column; gap:8px; }
.px-agenda .px-arow { display:flex; gap:12px; font-size:.92rem; }
.px-agenda .px-adate { color:var(--color-accent,#6366f1); font-weight:700; min-width:64px; }
</style>
<div class="px-cal">
  <div class="px-calhead">${headingsHtml(fields.headings, 2) || '<h2>Events</h2>'}<span class="px-month">${esc(monthName)}</span></div>
  <div class="px-grid">${dows.map((d) => `<div class="px-dow">${d}</div>`).join('')}${cells.join('')}</div>
  ${events.length ? `<div class="px-agenda">${events.slice(0, 12).map((e) => `<div class="px-arow"><span class="px-adate">${e.date.mo}/${e.date.d}</span><span>${esc(e.heading)}</span></div>`).join('')}</div>` : ''}
</div>`;
}

// A swipeable flyer/poster slider (CSS scroll-snap, no JS). Each image is a
// slide; alt doubles as an optional caption.
export function renderFlyerSlider(fields) {
  const images = fields.images || [];
  return `<style>
.px-slider-wrap { max-width:1100px; margin:0 auto; padding:40px 24px; }
.px-slider-wrap h2 { margin:0 0 16px; }
.px-slider { display:flex; gap:16px; overflow-x:auto; scroll-snap-type:x mandatory; padding-bottom:10px; -webkit-overflow-scrolling:touch; }
.px-slide { flex:0 0 auto; width:min(78%,340px); scroll-snap-align:center; }
.px-slide img { width:100%; border-radius:16px; display:block; box-shadow:0 8px 30px rgba(0,0,0,0.18); }
.px-slide figcaption { text-align:center; color:var(--color-muted,#a1a1aa); font-size:.9rem; margin-top:8px; }
.px-slider-hint { text-align:center; color:var(--color-muted,#a1a1aa); font-size:.8rem; margin-top:6px; }
</style>
<div class="px-slider-wrap">
  ${headingsHtml(fields.headings, 2)}
  <div class="px-slider">
    ${images.map((im) => `<figure class="px-slide"><img ${LAZY} src="${esc(im.src)}" alt="${esc(im.alt || '')}" />${im.alt ? `<figcaption>${esc(im.alt)}</figcaption>` : ''}</figure>`).join('')}
  </div>
  <div class="px-slider-hint">← swipe / scroll →</div>
</div>`;
}

// An auto-scrolling logo strip (CSS animation, no JS). The set is duplicated
// so the loop is seamless.
export function renderLogoMarquee(fields) {
  const images = fields.images || [];
  const strip = [...images, ...images];
  return `<style>
.px-lm { padding:32px 0; overflow:hidden; }
.px-lm .px-head { text-align:center; color:var(--color-muted,#a1a1aa); font-size:.85rem; text-transform:uppercase; letter-spacing:.06em; margin-bottom:18px; }
.px-lm-track { display:flex; gap:56px; width:max-content; animation:px-marquee 28s linear infinite; align-items:center; }
.px-lm-track img { height:34px; filter:grayscale(1); opacity:.7; }
@keyframes px-marquee { from{ transform:translateX(0);} to{ transform:translateX(-50%);} }
</style>
<div class="px-lm">
  ${(fields.headings || [])[0] ? `<div class="px-head">${esc(fields.headings[0])}</div>` : ''}
  <div class="px-lm-track">${strip.map((im) => `<img ${LAZY} src="${esc(im.src)}" alt="${esc(im.alt || '')}" />`).join('')}</div>
</div>`;
}

// Auto-scrolling testimonial cards (CSS animation, no JS). item: heading =
// name, meta = role, body = quote, image = avatar.
export function renderTestimonialMarquee(fields) {
  const items = fields.items || [];
  const strip = [...items, ...items];
  return `<style>
.px-tm-wrap { padding:48px 0; overflow:hidden; }
.px-tm-wrap .px-head { text-align:center; margin:0 24px 24px; }
.px-tm-track { display:flex; gap:16px; width:max-content; animation:px-tmarquee 40s linear infinite; }
.px-tm-wrap:hover .px-tm-track { animation-play-state:paused; }
.px-tmc { flex:0 0 auto; width:320px; padding:22px; border-radius:16px; border:1px solid var(--border,rgba(127,127,127,0.18)); background:var(--surface,rgba(127,127,127,0.05)); }
.px-tmc .px-q { line-height:1.6; margin:0 0 14px; }
.px-tmc .px-who { display:flex; gap:10px; align-items:center; }
.px-tmc .px-who img { width:38px; height:38px; border-radius:50%; object-fit:cover; }
.px-tmc .px-n { font-weight:600; font-size:.92rem; }
.px-tmc .px-r { color:var(--color-muted,#a1a1aa); font-size:.82rem; }
@keyframes px-tmarquee { from{ transform:translateX(0);} to{ transform:translateX(-50%);} }
</style>
<div class="px-tm-wrap">
  <div class="px-head">${headingsHtml(fields.headings, 2)}</div>
  <div class="px-tm-track">
    ${strip.map((it) => `<div class="px-tmc"><p class="px-q">${esc(it.body)}</p><div class="px-who">${it.image ? `<img ${LAZY} src="${esc(it.image)}" alt="" />` : ''}<div><div class="px-n">${esc(it.heading)}</div>${it.meta ? `<div class="px-r">${esc(it.meta)}</div>` : ''}</div></div></div>`).join('')}
  </div>
</div>`;
}

// The collection-list block is a placeholder until hydration: the editor
// swaps in live entries as you type (StructuredBlockEditor) and the server
// does the same at serve time (hydrateCollectionBlocks), both via
// applyCollectionToBlock in src/shared/collectionsMap.js. What renders here
// is only what you'd see if neither ran -- an unbound block.
export function renderCollectionList(fields) {
  const limit = Number(fields.limit) || 0;
  return `<div class="nx-collection" data-collection="${esc(fields.collectionSlug || '')}" data-layout="${esc(fields.layout || 'cards')}">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  <p style="text-align:center;color:#64748b;font-size:14px;padding:24px">
    ${fields.collectionSlug
      ? `Showing ${limit > 0 ? `up to ${limit} entries` : 'every entry'} from this collection.`
      : 'Pick a collection in the Content panel.'}
  </p>
</div>`;
}

// Language switcher. Rendered with the site's locales at serve time (the
// block itself stores nothing but styling choices), so adding a language in
// Design settings updates every switcher on the site at once.
export function renderLanguageSwitcher(fields) {
  const locales = Array.isArray(fields.locales) ? fields.locales : [];
  if (locales.length === 0) {
    return `<div class="nx-langs"><p style="text-align:center;color:#64748b;font-size:14px;padding:16px">Add a second language in Design settings to use this block.</p></div>`;
  }
  const style = fields.style === 'dropdown' ? 'dropdown' : 'inline';
  const items = locales.map((l) => (l.current
    ? `<span class="nx-lang nx-lang-current" aria-current="true">${esc(l.label)}</span>`
    : `<a class="nx-lang" href="${esc(l.href)}" hreflang="${esc(l.code)}">${esc(l.label)}</a>`)).join('');
  return `<style>${BASE_STYLE}
.nx-langs { display:flex; gap:12px; align-items:center; justify-content:${style === 'dropdown' ? 'flex-end' : 'center'}; padding:12px 24px; flex-wrap:wrap; }
.nx-lang { font-size:14px; color: var(--color-muted); text-decoration:none; }
.nx-lang:hover { color: var(--color-text); }
.nx-lang-current { color: var(--color-text); font-weight:600; }
</style>
<nav class="nx-langs" aria-label="Language">${items}</nav>`;
}

// Site search. Renders a real form that works without JavaScript (it falls
// back to a normal GET, which the public router answers) and progressively
// enhances into inline results when JS is available. The inline script is
// hashed into the page's CSP by inlineScriptHashes in server.js, so this
// stays on the strict policy rather than needing 'unsafe-inline'.
export function renderSearch(fields) {
  const placeholder = esc(fields.placeholder || 'Search this site…');
  const buttonLabel = esc(fields.buttonLabel || 'Search');
  return `<style>${BASE_STYLE}
.nx-search { max-width: 640px; margin: 0 auto; padding: 32px 24px; }
.nx-search form { display: flex; gap: 8px; }
.nx-search input { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border,rgba(255,255,255,0.15)); background: var(--surface,rgba(255,255,255,0.05)); color: var(--color-text); font-size: 15px; }
.nx-search button { padding: 12px 20px; border-radius: 10px; border: 0; background: var(--color-accent); color: var(--on-accent,#fff); font-weight: 600; cursor: pointer; }
.nx-search-results { margin-top: 20px; display: flex; flex-direction: column; gap: 14px; }
.nx-search-hit a { font-size: 17px; color: var(--color-link); text-decoration: none; font-weight: 600; }
.nx-search-hit p { margin: 4px 0 0; font-size: 14px; color: var(--color-muted); }
.nx-search-hit mark { background: var(--accent-soft,rgba(99,102,241,0.25)); color: inherit; padding: 0 2px; border-radius: 3px; }
.nx-search-empty { font-size: 14px; color: var(--color-muted); }
</style>
<div class="nx-search">
  ${headingsHtml(fields.headings, 2)}
  <form role="search" action="" method="GET">
    <input type="search" name="q" placeholder="${placeholder}" aria-label="${placeholder}" />
    <button type="submit">${buttonLabel}</button>
  </form>
  <div class="nx-search-results" aria-live="polite"></div>
</div>
<script>
(function(){
  var root = document.currentScript.previousElementSibling;
  var form = root.querySelector('form');
  var input = root.querySelector('input[name=q]');
  var out = root.querySelector('.nx-search-results');
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function render(data, q){
    if (!data.results.length) { out.innerHTML = '<p class="nx-search-empty">Nothing found for &ldquo;' + esc(q) + '&rdquo;.</p>'; return; }
    out.innerHTML = data.results.map(function(r){
      return '<div class="nx-search-hit"><a href="' + esc(r.path) + '">' + r.title + '</a><p>' + r.excerpt + '</p></div>';
    }).join('');
  }
  function run(q){
    if (!q) { out.innerHTML = ''; return; }
    fetch('/api/public/search?q=' + encodeURIComponent(q) + '&locale=' + encodeURIComponent(document.documentElement.lang || ''))
      .then(function(r){ return r.json(); })
      .then(function(d){ render(d, q); })
      .catch(function(){ out.innerHTML = '<p class="nx-search-empty">Search is unavailable right now.</p>'; });
  }
  form.addEventListener('submit', function(e){ e.preventDefault(); run(input.value.trim()); });
  var initial = new URLSearchParams(location.search).get('q');
  if (initial) { input.value = initial; run(initial); }
})();
</script>`;
}

// ---------------------------------------------------------------------------
// Editorial block set ("ed-" prefix). Added for the Ethan Scott Realty
// template, but deliberately generic: an eyebrow label, a numbered index, a
// swatch grid and a timeline are the four shapes almost every editorial
// layout reaches for, and none of them existed.
//
// All four honour --font-display / --font-mono, so they pick up whatever type
// roles the workspace theme selects rather than hardcoding a family.
// ---------------------------------------------------------------------------

const ED_STYLE = `
.ed-wrap { max-width: 1240px; margin: 0 auto; padding: 0 24px; }
.ed-eyebrow { font-family: var(--font-mono, monospace); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--color-accent); display: block; margin-bottom: 14px; }
.ed-head { margin-bottom: 34px; }
.ed-head h2 { font-family: var(--font-display); font-size: clamp(29px, 5vw, 50px); letter-spacing: -.025em; line-height: 1.05; margin: 0; }
.ed-lede { font-size: 17px; color: var(--color-muted); margin: 18px 0 0; max-width: 62ch; }
@media (min-width: 900px) {
  .ed-head.split { display: grid; grid-template-columns: 1fr 1.15fr; gap: 60px; align-items: end; }
  .ed-head.split .ed-lede { margin-top: 0; }
}
`;

// A numbered index — the "list of nine trades" shape. Reads as a reference
// table rather than a bulleted list, which is the point.
export function renderNumberedIndex(fields) {
  const items = fields.items || [];
  return `<style>${ED_STYLE}
.ed-index { display: grid; border-top: 1px solid var(--border); }
.ed-index-item { padding: 16px 0; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; gap: 14px; }
.ed-index-item i { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--color-muted); font-style: normal; flex: none; }
.ed-index-item b { font-family: var(--font-display); font-size: 19px; font-weight: 500; }
.ed-index-item span { font-size: 14px; color: var(--color-muted); margin-left: auto; text-align: right; }
@media (min-width: 720px) { .ed-index { grid-template-columns: 1fr 1fr; column-gap: 36px; } }
@media (min-width: 1040px) { .ed-index { grid-template-columns: repeat(3, 1fr); } }
</style>
<div class="ed-wrap" style="padding-top:64px;padding-bottom:64px">
  <div class="ed-head split">
    <div>${fields.eyebrow ? `<span class="ed-eyebrow">${esc(fields.eyebrow)}</span>` : ''}${headingsHtml(fields.headings, 2)}</div>
    ${(fields.text || []).map((t) => `<p class="ed-lede">${esc(t)}</p>`).join('')}
  </div>
  <div class="ed-index">
    ${items.map((it, i) => `<div class="ed-index-item"><i>${String(i + 1).padStart(2, '0')}</i><b>${esc(it.heading)}</b>${it.meta ? `<span>${esc(it.meta)}</span>` : ''}</div>`).join('')}
  </div>
</div>`;
}

// Swatch cards: a colour bar over a coded, titled card. `meta` is the colour,
// so it stays editable as plain text rather than needing a picker.
export function renderSwatchCards(fields) {
  const items = fields.items || [];
  return `<style>${ED_STYLE}
.ed-sw-grid { display: grid; gap: 14px; }
.ed-sw { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.ed-sw-bar { height: 88px; background: var(--color-accent); }
.ed-sw-txt { padding: 18px 18px 22px; }
.ed-sw-txt .code { font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: .12em; color: var(--color-muted); display: block; margin-bottom: 9px; text-transform: uppercase; }
.ed-sw-txt h3 { font-family: var(--font-display); font-size: 20px; margin: 0 0 8px; }
.ed-sw-txt p { font-size: 15px; color: var(--color-muted); margin: 0; }
@media (min-width: 720px) { .ed-sw-grid { grid-template-columns: repeat(3, 1fr); gap: 18px; } }
</style>
<div class="ed-wrap" style="padding-top:64px;padding-bottom:64px">
  <div class="ed-head split">
    <div>${fields.eyebrow ? `<span class="ed-eyebrow">${esc(fields.eyebrow)}</span>` : ''}${headingsHtml(fields.headings, 2)}</div>
    ${(fields.text || []).map((t) => `<p class="ed-lede">${esc(t)}</p>`).join('')}
  </div>
  <div class="ed-sw-grid">
    ${items.map((it, i) => `<div class="ed-sw">
      <div class="ed-sw-bar"${it.meta ? ` style="background:${esc(it.meta)}"` : ''}></div>
      <div class="ed-sw-txt"><span class="code">${String(i + 1).padStart(2, '0')} — ${esc(it.link || it.heading)}</span><h3>${esc(it.heading)}</h3><p>${esc(it.body)}</p></div>
    </div>`).join('')}
  </div>
  ${fields.buttonLabel ? `<span class="ed-eyebrow" style="margin-top:26px">${esc(fields.buttonLabel)}</span>` : ''}
</div>`;
}

// A labelled timeline — "AGE 15 / THEN / NOW". The label column is fixed so
// the entries line up however long the labels get.
export function renderTimeline(fields) {
  const items = fields.items || [];
  return `<style>${ED_STYLE}
.ed-tl { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--border); }
.ed-tl li { display: grid; grid-template-columns: 84px 1fr; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--border); font-size: 16px; }
.ed-tl i { font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: .11em; color: var(--color-accent); font-style: normal; padding-top: 5px; text-transform: uppercase; }
</style>
<div class="ed-wrap" style="padding-top:64px;padding-bottom:64px">
  <div class="ed-head">
    ${fields.eyebrow ? `<span class="ed-eyebrow">${esc(fields.eyebrow)}</span>` : ''}${headingsHtml(fields.headings, 2)}
    ${(fields.text || []).map((t) => `<p class="ed-lede">${esc(t)}</p>`).join('')}
  </div>
  <ul class="ed-tl">
    ${items.map((it) => `<li><i>${esc(it.meta)}</i><span>${esc(it.body || it.heading)}</span></li>`).join('')}
  </ul>
</div>`;
}

// A multi-step qualifying form — the "four questions, thirty seconds" card.
//
// Why this rather than the plain Contact Form block: asking for an email
// first converts far worse than asking it last, after someone has already
// invested four taps. The steps are authored as `items`, one per step, with
// the chip choices in `body` as a comma-separated list; the contact step is
// always appended last so the block can't be misconfigured into collecting
// nothing.
//
// It posts to /api/public/forms like every other form, so responses land in
// the same inbox. No JS means no multi-step, so the fallback is the whole
// thing rendered as one plain form — it still submits.
export function renderLeadForm(fields) {
  const steps = (fields.items || []).filter((it) => it.heading);
  const formName = fields.headings?.[0] || 'Home search preferences';
  const total = steps.length + 1;

  const chipsFor = (step, si) => (step.body || '')
    .split(',').map((c) => c.trim()).filter(Boolean)
    .map((c) => `<button type="button" class="lf-chip" data-group="q${si}" data-multi="${step.meta === 'multi' ? '1' : '0'}" aria-pressed="false">${esc(c)}</button>`)
    .join('');

  return `<style>${BASE_STYLE}
.lf { background: var(--surface-strong, #fff); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; box-shadow: 0 30px 60px -34px rgba(0,0,0,.5); max-width: 560px; margin: 0 auto; }
.lf-head { background: var(--color-primary); color: #fff; padding: 15px 18px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.lf-head span { font-family: var(--font-mono, monospace); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; }
.lf-head em { font-family: var(--font-mono, monospace); font-size: 10px; font-style: normal; color: rgba(255,255,255,.6); flex: none; }
.lf-ticks { display: flex; gap: 4px; padding: 0 18px; background: var(--color-primary); }
.lf-tick { height: 3px; flex: 1; background: rgba(255,255,255,.2); transition: background .4s ease; }
.lf-tick.on { background: var(--color-accent); }
.lf-body { padding: 26px 18px 22px; }
.lf-q { font-family: var(--font-display); font-size: 25px; font-weight: 600; letter-spacing: -.025em; margin-bottom: 6px; }
.lf-help { font-size: 14.5px; color: var(--color-muted); margin-bottom: 18px; }
.lf-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.lf-chip { font-family: var(--font-display); font-size: 15.5px; background: var(--surface); border: 1px solid var(--border); padding: 12px 16px; border-radius: 3px; cursor: pointer; color: inherit; min-height: 46px; transition: all .16s ease; }
.lf-chip[aria-pressed="true"] { background: var(--color-accent); color: var(--on-accent, #fff); border-color: var(--color-accent); }
.lf-fields { display: grid; gap: 10px; }
.lf-fields input { font-family: inherit; font-size: 16px; padding: 14px; border: 1px solid var(--border); border-radius: 3px; background: var(--surface); color: inherit; width: 100%; min-height: 50px; }
.lf-row2 { display: grid; gap: 10px; }
@media (min-width: 560px) { .lf-row2 { grid-template-columns: 1fr 1fr; } }
.lf-consent { display: flex; gap: 11px; align-items: flex-start; margin: 16px 0 2px; font-size: 12.5px; line-height: 1.5; color: var(--color-muted); cursor: pointer; }
.lf-consent input { margin-top: 2px; width: 20px; height: 20px; flex: none; }
.lf-foot { display: flex; gap: 10px; align-items: center; padding: 0 18px 22px; }
.lf-back { background: none; border: none; font-family: var(--font-display); font-size: 15px; color: var(--color-muted); cursor: pointer; padding: 12px 6px; min-height: 46px; }
.lf-next { flex: 1; font-family: var(--font-display); font-size: 16px; font-weight: 600; border: none; cursor: pointer; background: var(--color-accent); color: var(--on-accent, #fff); padding: 15px 20px; border-radius: 3px; min-height: 48px; }
.lf-next:disabled { opacity: .45; cursor: not-allowed; }
.lf-step { display: none; }
.lf-step.on { display: block; }
.lf-nojs .lf-step { display: block; }
.lf-nojs .lf-ticks, .lf-nojs .lf-back { display: none; }
</style>
<div class="lf lf-nojs" data-leadform>
  <div class="lf-head"><span>${esc(formName)}</span><em data-lf-label>Step 1 / ${total}</em></div>
  <div class="lf-ticks">${Array.from({ length: total }, (_, i) => `<i class="lf-tick${i === 0 ? ' on' : ''}" data-t="${i + 1}"></i>`).join('')}</div>
  <form action="/api/public/forms" method="POST">
    <input type="hidden" name="_form" value="${esc(formName)}" />
    <input type="text" name="_hp" style="position:absolute;left:-9999px" tabindex="-1" autocomplete="off" />
    <div class="lf-body">
      ${steps.map((step, si) => `<div class="lf-step${si === 0 ? ' on' : ''}" data-step="${si + 1}">
        <div class="lf-q">${esc(step.heading)}</div>
        ${step.link ? `<p class="lf-help">${esc(step.link)}</p>` : ''}
        <div class="lf-chips">${chipsFor(step, si)}</div>
        <input type="hidden" name="${esc(step.image || `answer_${si + 1}`)}" data-answer="q${si}" />
      </div>`).join('')}
      <div class="lf-step" data-step="${total}">
        <div class="lf-q">${esc(fields.buttonLabel || 'Where should I send them?')}</div>
        <p class="lf-help">${esc(fields.placeholder || "You'll hear from a person, not a call centre.")}</p>
        <div class="lf-fields">
          <div class="lf-row2">
            <input type="text" name="first_name" placeholder="First name" autocomplete="given-name" />
            <input type="text" name="last_name" placeholder="Last name" autocomplete="family-name" />
          </div>
          <input type="email" name="email" placeholder="Email address" autocomplete="email" inputmode="email" required />
          <input type="tel" name="phone" placeholder="Phone (optional)" autocomplete="tel" inputmode="tel" />
        </div>
        <label class="lf-consent"><input type="checkbox" name="consent" value="yes" required /><span>${esc(fields.consent || 'Send me matching listings and market notes by email. I can unsubscribe any time.')}</span></label>
      </div>
    </div>
    <div class="lf-foot">
      <button type="button" class="lf-back" data-lf-back hidden>Back</button>
      <button type="submit" class="lf-next" data-lf-next>Continue</button>
    </div>
  </form>
</div>
<script>
(function(){
  var root = document.currentScript.previousElementSibling;
  if(!root) return;
  root.classList.remove('lf-nojs');
  var form = root.querySelector('form'), steps = root.querySelectorAll('.lf-step');
  // The contact fields carry the required attribute so the no-JS fallback
  // (every step visible, one plain form) still validates. With JS on, those
  // fields are display:none until the last step, and a hidden required
  // control blocks submit entirely -- so Continue silently did nothing. JS
  // gates each step itself via ok(), so it strips them now that it owns that.
  form.querySelectorAll('[required]').forEach(function(el){ el.removeAttribute('required'); });
  var next = root.querySelector('[data-lf-next]'), back = root.querySelector('[data-lf-back]');
  var label = root.querySelector('[data-lf-label]'), ticks = root.querySelectorAll('.lf-tick');
  var TOTAL = steps.length, step = 1;

  function answers(g){ return Array.prototype.slice.call(root.querySelectorAll('.lf-chip[data-group="'+g+'"][aria-pressed="true"]')).map(function(c){return c.textContent;}); }
  function sync(){
    root.querySelectorAll('[data-answer]').forEach(function(inp){ inp.value = answers(inp.getAttribute('data-answer')).join(', '); });
  }
  function ok(){
    var cur = steps[step-1];
    if(step === TOTAL){
      var em = form.querySelector('input[name=email]'), cs = form.querySelector('input[name=consent]');
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim()) && cs.checked;
    }
    return cur.querySelectorAll('.lf-chip[aria-pressed="true"]').length > 0;
  }
  function show(n){
    for(var i=0;i<steps.length;i++) steps[i].classList.toggle('on', i === n-1);
    for(var j=0;j<ticks.length;j++) ticks[j].classList.toggle('on', j < n);
    label.textContent = 'Step ' + n + ' / ' + TOTAL;
    back.hidden = n === 1;
    next.textContent = n === TOTAL ? 'Send my matches' : 'Continue';
    next.disabled = !ok();
  }
  root.addEventListener('click', function(e){
    var chip = e.target.closest('.lf-chip'); if(!chip) return;
    var multi = chip.getAttribute('data-multi') === '1', on = chip.getAttribute('aria-pressed') === 'true';
    if(!multi) root.querySelectorAll('.lf-chip[data-group="'+chip.getAttribute('data-group')+'"]').forEach(function(c){ c.setAttribute('aria-pressed','false'); });
    chip.setAttribute('aria-pressed', on ? 'false' : 'true');
    sync(); next.disabled = !ok();
  });
  form.addEventListener('input', function(){ next.disabled = !ok(); });
  form.addEventListener('change', function(){ next.disabled = !ok(); });
  back.addEventListener('click', function(){ if(step>1){ step--; show(step); } });
  form.addEventListener('submit', function(e){
    if(step < TOTAL){ e.preventDefault(); step++; show(step); root.scrollIntoView({block:'nearest'}); }
    // On the last step the browser submits normally to /api/public/forms.
  });
  show(1);
})();
</script>`;
}

// A full-viewport hero with moving media behind it.
//
// Distinct from video-bg, which is a 460px centred band: this fills the
// screen, bottom-aligns its copy on phones (where the top half is covered by
// the browser chrome anyway) and centres it on desktop. When no video and no
// poster are set it falls back to a slow animated gradient rather than a flat
// colour, so the block is never a dead grey rectangle while someone is still
// sourcing footage.
//
// The video only mounts when a source exists, the connection isn't metered
// and the visitor hasn't asked for reduced motion — a 3MB autoplaying loop is
// exactly what you don't want to push at someone on a train.
export function renderHeroVideo(fields) {
  const poster = fields.images?.[0];
  const src = fields.videoUrl ? esc(fields.videoUrl) : '';
  const links = fields.links || [];
  return `<style>
.hv { position:relative; min-height:100svh; display:flex; flex-direction:column; justify-content:flex-end; overflow:clip; padding:120px 0 56px; color:#fff; }
.hv-bg { position:absolute; inset:0; z-index:0; }
.hv-bg video, .hv-bg img, .hv-fallback { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.hv-fallback { background:
    radial-gradient(120% 80% at 20% 15%, var(--color-secondary, #2C4640) 0%, transparent 60%),
    radial-gradient(110% 70% at 85% 80%, var(--color-accent, #3A4F3B) 0%, transparent 55%),
    linear-gradient(165deg, var(--color-primary, #16241F) 0%, #0D1614 55%, var(--color-primary, #1A2622) 100%);
  animation: hv-drift 26s ease-in-out infinite alternate; }
@keyframes hv-drift { from { transform:scale(1.06) } to { transform:scale(1.16) translate3d(-2%,-2%,0) } }
.hv-scrim { position:absolute; inset:0; z-index:1; background:linear-gradient(180deg, rgba(11,18,17,.62) 0%, rgba(11,18,17,.28) 35%, rgba(11,18,17,.84) 100%); }
.hv-grain { position:absolute; inset:0; z-index:1; opacity:.35; pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E"); }
.hv-wrap { position:relative; z-index:2; max-width:1240px; margin:0 auto; padding:0 24px; width:100%; }
.hv-eyebrow { font-family:var(--font-mono, monospace); font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent-on-dark, var(--color-accent)); display:block; margin-bottom:18px; }
.hv h1 { font-family:var(--font-display); font-size:clamp(38px,9vw,74px); letter-spacing:-.025em; line-height:1.05; margin:0; text-wrap:balance; }
.hv-sub { font-size:17px; margin-top:20px; max-width:36ch; color:rgba(255,255,255,.82); }
.hv-cta { display:flex; flex-wrap:wrap; gap:10px; margin-top:28px; }
.hv-cta a { font-family:var(--font-display); font-size:16px; font-weight:600; padding:15px 22px; border-radius:3px; text-decoration:none; background:var(--color-accent); color:var(--on-accent,#fff); }
.hv-cta a + a { background:transparent; color:#fff; border:1px solid rgba(255,255,255,.28); }
.hv-hint { display:none; align-items:center; gap:10px; margin-top:40px; color:rgba(255,255,255,.6); font-family:var(--font-mono, monospace); font-size:10px; letter-spacing:.16em; text-transform:uppercase; }
.hv-hint i { width:34px; height:1px; background:var(--accent-on-dark, var(--color-accent)); display:block; }
@media (min-width:1040px){ .hv{ justify-content:center; padding:150px 0 90px } .hv-sub{ font-size:19px } .hv-hint{ display:flex } }
@media (prefers-reduced-motion:reduce){ .hv-fallback{ animation:none } }
</style>
<div class="hv">
  <div class="hv-bg" data-hero-bg${src ? ` data-src="${src}"` : ''}>
    ${poster ? `<img ${EAGER} src="${esc(poster.src)}" alt="${esc(poster.alt || '')}" />` : '<div class="hv-fallback"></div>'}
  </div>
  <div class="hv-scrim"></div><div class="hv-grain"></div>
  <div class="hv-wrap">
    ${fields.eyebrow ? `<span class="hv-eyebrow">${esc(fields.eyebrow)}</span>` : ''}
    <h1>${esc(fields.headings?.[0] || '')}</h1>
    ${(fields.text || []).map((t) => `<p class="hv-sub">${esc(t)}</p>`).join('')}
    ${links.length ? `<div class="hv-cta">${links.map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || 'Learn more')}</a>`).join('')}</div>` : ''}
    ${fields.buttonLabel ? `<div class="hv-hint"><i></i>${esc(fields.buttonLabel)}</div>` : ''}
  </div>
</div>
<script>
(function(){
  var bg = document.currentScript.previousElementSibling.querySelector('[data-hero-bg]');
  var src = bg && bg.getAttribute('data-src');
  if(!src) return;
  var conn = navigator.connection || {};
  if(conn.saveData || /2g/.test(conn.effectiveType || '')) return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var v = document.createElement('video');
  v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
  v.setAttribute('aria-hidden','true');
  v.addEventListener('error', function(){ v.remove(); });
  v.src = src;
  bg.appendChild(v);
  var p = v.play(); if(p && p.catch) p.catch(function(){});
})();
</script>`;
}

// A bar pinned to the bottom of the screen on phones, where the real call to
// action is otherwise a scroll away. Hidden from 1040px up, because on
// desktop the nav is always visible and a permanent bar is just lost space.
//
// It retracts while the section it points at is on screen — nobody needs a
// "Start my search" button floating over the search form.
export function renderStickyCta(fields) {
  const links = fields.links || [];
  if (links.length === 0) return '';
  const primary = links[0];
  const secondary = links[1];
  return `<style>
.sk { position:fixed; left:0; right:0; bottom:0; z-index:90; display:flex; gap:10px;
  padding:12px 20px calc(12px + env(safe-area-inset-bottom));
  background:color-mix(in srgb, var(--color-primary, #12201F) 92%, transparent);
  backdrop-filter:blur(14px); border-top:1px solid rgba(255,255,255,.14);
  transition:transform .35s ease; }
.sk.sk-hide { transform:translateY(130%); }
.sk a { font-family:var(--font-display); font-size:16px; font-weight:600; text-align:center;
  padding:15px 20px; border-radius:3px; text-decoration:none; min-height:48px;
  background:var(--color-accent); color:var(--on-accent,#fff); flex:1;
  display:flex; align-items:center; justify-content:center; }
.sk a + a { flex:none; background:transparent; color:#fff; border:1px solid rgba(255,255,255,.22); padding:15px 18px; }
@media (min-width:1040px){ .sk{ display:none } }
</style>
<div class="sk" data-sticky${fields.buttonLabel ? ` data-until="${esc(fields.buttonLabel)}"` : ''}>
  <a href="${esc(primary.href || '#')}">${esc(primary.label || 'Get started')}</a>
  ${secondary ? `<a href="${esc(secondary.href || '#')}">${esc(secondary.label || 'Call')}</a>` : ''}
</div>
<script>
(function(){
  var bar = document.currentScript.previousElementSibling;
  var sel = bar.getAttribute('data-until');
  if(!sel) return;
  var target;
  try { target = document.querySelector(sel); } catch(e) { return; }
  if(!target || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(function(entries){
    bar.classList.toggle('sk-hide', entries[0].isIntersecting);
  }, { threshold: 0.15 }).observe(target);
})();
</script>`;
}

// A hairline reading-progress bar across the top of the window. Purely
// ambient, so it sits behind prefers-reduced-motion and adds nothing to the
// accessibility tree.
export function renderScrollProgress(fields) {
  return `<style>
.sp { position:fixed; top:0; left:0; height:${Math.min(8, Math.max(1, Number(fields.limit) || 2))}px; width:100%;
  transform:scaleX(0); transform-origin:0 50%; background:var(--color-accent); z-index:120; pointer-events:none; }
</style>
<div class="sp" data-progress aria-hidden="true"></div>
<script>
(function(){
  var bar = document.currentScript.previousElementSibling, ticking = false;
  function frame(){
    ticking = false;
    var h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')';
  }
  addEventListener('scroll', function(){ if(!ticking){ ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  frame();
})();
</script>`;
}

// A 3D model, embedded through the sandboxed frame (see lib/modelFrame.js).
//
// The block itself is trivial: it is an <iframe> pointing at /_nexus/model-frame
// with the chosen options as query params. All the WebGL, WASM and CSP
// handling lives in the frame; the published page stays strict and only had to
// gain frame-src 'self'. `allow="xr-spatial-tracking"` is what lets AR ("view
// in your space") run inside the frame; without it WebXR is blocked there.
export function renderModel3d(fields) {
  const model = String(fields.modelUrl || '').trim();
  const heading = fields.headings?.[0];
  const caption = String(fields.caption || '').trim();
  const height = Math.min(900, Math.max(240, Number(fields.height) || 480));
  const head = heading ? `<h2 class="nx-model-h">${esc(heading)}</h2>` : '';

  if (!model) {
    return `<style>
.nx-model-wrap { max-width:1000px; margin:0 auto; padding:48px 24px; }
.nx-model-h { font-family:var(--font-display); font-size:var(--text-h2); margin:0 0 16px; }
.nx-model-empty { border:1px dashed var(--border); border-radius:12px; padding:56px 20px; text-align:center; color:var(--color-muted); font-size:14px; }
</style>
<div class="nx-model-wrap">${head}<div class="nx-model-empty">Add a 3D model (a .glb file) to this block.</div></div>`;
  }

  const params = new URLSearchParams();
  params.set('src', model);
  if (fields.poster) params.set('poster', String(fields.poster));
  if (fields.iosUrl) params.set('ios', String(fields.iosUrl));
  if (fields.alt) params.set('alt', String(fields.alt).slice(0, 120));
  if (fields.bg === 'color' && fields.bgColor) params.set('bg', String(fields.bgColor));
  params.set('rotate', fields.rotate ? '1' : '0');
  params.set('interact', fields.interact === false ? '0' : '1');
  params.set('ar', fields.ar ? '1' : '0');

  const bgClass = fields.bg === 'surface' ? ' nx-model-frame--surface' : '';
  return `<style>
.nx-model-wrap { max-width:1000px; margin:0 auto; padding:48px 24px; }
.nx-model-h { font-family:var(--font-display); font-size:var(--text-h2); margin:0 0 16px; }
.nx-model-frame { width:100%; border:0; display:block; border-radius:12px; overflow:hidden; background:var(--surface); }
.nx-model-frame--surface { background:var(--surface-strong); }
.nx-model-cap { color:var(--color-muted); font-size:13px; margin-top:10px; text-align:center; }
</style>
<div class="nx-model-wrap">
  ${head}
  <iframe class="nx-model-frame${bgClass}" src="/_nexus/model-frame?${esc(params.toString())}" title="${esc(fields.alt || heading || '3D model')}" loading="lazy" allow="xr-spatial-tracking; fullscreen" style="height:${height}px"></iframe>
  ${caption ? `<p class="nx-model-cap">${esc(caption)}</p>` : ''}
</div>`;
}

// A hosted virtual tour (Matterport and the like), embedded through the
// provider's own player. Same shape as the Video Embed block: the agent
// pastes a share link or the provider's <iframe> snippet, and it is validated
// against tourProviders.js before an iframe is emitted -- an unsupported host
// gets an explanation, not a frame the page CSP would just block. The allow
// list here (gyroscope/xr) is what lets a 360 or VR tour respond to a phone's
// motion and enter fullscreen or headset view.
export function renderVirtualTour(fields) {
  const heading = fields.headings?.[0];
  const intro = (fields.text || []).map((t) => `<p class="nx-tour-intro">${esc(t)}</p>`).join('');
  const caption = String(fields.caption || '').trim();
  const height = Math.min(900, Math.max(280, Number(fields.height) || 520));
  const head = heading ? `<h2 class="nx-tour-h">${esc(heading)}</h2>` : '';

  const parsed = parseTourInput(fields.tourUrl);
  const shell = (inner) => `<style>
.nx-tour-wrap { max-width:1100px; margin:0 auto; padding:48px 24px; }
.nx-tour-h { font-family:var(--font-display); font-size:var(--text-h2); margin:0 0 12px; }
.nx-tour-intro { color:var(--color-muted); max-width:60ch; margin:0 0 20px; }
.nx-tour-frame { width:100%; border:0; display:block; border-radius:12px; background:var(--surface-strong); }
.nx-tour-cap { color:var(--color-muted); font-size:13px; margin-top:10px; text-align:center; }
.nx-tour-empty { border:1px dashed var(--border); border-radius:12px; padding:56px 20px; text-align:center; color:var(--color-muted); font-size:14px; }
</style>
<div class="nx-tour-wrap">${head}${intro}${inner}</div>`;

  if (!parsed.ok) {
    const msg = parsed.reason === 'empty'
      ? `Paste a virtual tour link to show it here. Works with ${esc(TOUR_PROVIDER_NAMES)}.`
      : `That link isn't from a tour host we can embed. Supported: ${esc(TOUR_PROVIDER_NAMES)}.`;
    return shell(`<div class="nx-tour-empty">${msg}</div>`);
  }

  return shell(`<iframe class="nx-tour-frame" src="${esc(parsed.url)}" title="${esc(heading || 'Virtual tour')}" style="height:${height}px" loading="lazy" allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen; vr" allowfullscreen></iframe>${caption ? `<p class="nx-tour-cap">${esc(caption)}</p>` : ''}`);
}

export const BLOCK_RENDERERS = {
  header: renderHeader,
  navigation: renderNavigation,
  'nav-logo': renderNavLogo,
  'nav-center': renderNavCenter,
  'nav-utility': renderNavUtility,
  'nav-overlay': renderNavOverlay,
  'nav-drawer': renderNavDrawer,
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
  'model-3d': renderModel3d,
  'virtual-tour': renderVirtualTour,
  faq: renderFaq,
  tabs: renderTabs,
  countdown: renderCountdown,
  'social-links': renderSocialLinks,
  product: renderProduct,
  'social-feed': renderSocialFeed,
  'collection-list': renderCollectionList,
  'language-switcher': renderLanguageSwitcher,
  search: renderSearch,
  'numbered-index': renderNumberedIndex,
  'swatch-cards': renderSwatchCards,
  timeline: renderTimeline,
  'lead-form': renderLeadForm,
  'hero-video': renderHeroVideo,
  'sticky-cta': renderStickyCta,
  'scroll-progress': renderScrollProgress,
  'listing-cards': renderListingCards,
  'listing-search': renderListingSearch,
  'listing-hero': renderListingHero,
  'listing-facts': renderListingFacts,
  'listing-features': renderListingFeatures,
  'mortgage-calculator': renderMortgageCalc,
  'price-history': renderPriceHistory,
  'nearby-schools': renderNearbySchools,
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
  // Expanded polished set
  'hero-centered': renderHeroCentered,
  announcement: renderAnnouncement,
  checklist: renderChecklist,
  'feature-rows': renderFeatureRows,
  'metric-cards': renderMetricCards,
  'pricing-cards': renderPricingCards,
  'testimonial-grid': renderTestimonialGrid,
  'team-grid': renderTeamGrid,
  'faq-accordion': renderFaqAccordion,
  'contact-split': renderContactSplit,
  'gallery-masonry': renderGalleryMasonry,
  'cta-split': renderCtaSplit,
  'blog-cards': renderBlogCards,
  'banner-image': renderBannerImage,
  // Parallax + video
  parallax: renderParallax,
  'video-bg': renderVideoBg,
  'video-split': renderVideoSplit,
  // Events, sliders, marquees
  'events-list': renderEventsList,
  calendar: renderCalendar,
  'flyer-slider': renderFlyerSlider,
  'logo-marquee': renderLogoMarquee,
  'testimonial-marquee': renderTestimonialMarquee,
};

// Regenerates `html` from `fields` for a given blockType. Returns null for
// unknown/missing types so callers can fall back to raw HTML editing.
export function renderBlock(blockType, fields) {
  const renderer = BLOCK_RENDERERS[blockType];
  if (!renderer || !fields) return null;
  const html = renderer(fields);
  return fields.customCss ? `<style>\n${fields.customCss}\n</style>\n${html}` : html;
}
