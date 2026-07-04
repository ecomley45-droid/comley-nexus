// Turns segment.js's extracted `fields` into publishable HTML for a given
// `blockType`. This deliberately re-skins imported content in Nexus's own
// plain styling rather than preserving the source site's original CSS --
// `fields` only captures text/src/href, never classes or computed styles,
// so there is no original design to preserve. Output still passes through
// sanitizeContentHtml server-side on save like any hand-authored section.
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
  ${item.body ? `<p>${esc(item.body)}</p>` : ''}
  ${item.link ? `<a href="${esc(item.link)}">Learn more</a>` : ''}
</div>`;
}

const BASE_STYLE = `
.nx-item { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 14px; padding: 20px; }
.nx-item img { width: 100%; border-radius: 8px; margin-bottom: 12px; }
.nx-link { color: #a5b4fc; text-decoration: none; }
`;

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
.nx-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 24px; font-size: 14px; color: #a1a1aa; border-top: 1px solid rgba(255,255,255,0.08); }
</style>
<footer class="nx-footer">
  <div>${textHtml(fields.text)}</div>
  <div style="display:flex; gap:16px;">${linksHtml(fields.links)}</div>
</footer>`;
}

export function renderHero(fields) {
  return `<style>${BASE_STYLE}
.nx-hero { text-align: center; padding: 64px 24px; max-width: 720px; margin: 0 auto; }
.nx-hero .nx-cta { display: inline-block; margin-top: 20px; padding: 12px 24px; border-radius: 10px; background: linear-gradient(90deg, #6366f1, #d946ef); color: white; text-decoration: none; }
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
.nx-cta-section a { display: inline-block; margin: 8px; padding: 11px 22px; border-radius: 10px; background: linear-gradient(90deg, #6366f1, #d946ef); color: white; text-decoration: none; }
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

export function renderForm(fields) {
  return `<style>${BASE_STYLE}
.nx-form-note { padding: 32px 24px; max-width: 600px; margin: 0 auto; text-align: center; color: #a1a1aa; }
</style>
<div class="nx-form-note">
  ${headingsHtml(fields.headings, 2)}
  ${textHtml(fields.text)}
  <p><em>Imported form markup isn't preserved -- rebuild this form using the block editor.</em></p>
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
};

// Regenerates `html` from `fields` for a given blockType. Returns null for
// unknown/missing types so callers can fall back to raw HTML editing.
export function renderBlock(blockType, fields) {
  const renderer = BLOCK_RENDERERS[blockType];
  if (!renderer || !fields) return null;
  return renderer(fields);
}
