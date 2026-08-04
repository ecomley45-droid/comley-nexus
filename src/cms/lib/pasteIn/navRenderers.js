// Navigation bars.
//
// The original `header` block is a site name and a row of links that never
// collapses — fine as a placeholder, not something you ship. These five are
// the arrangements real sites actually use, and every one of them:
//
//   * takes a logo image, falling back to a wordmark when there isn't one,
//   * collapses to a toggle below 900px instead of overflowing off-screen,
//   * closes on Escape and on a click outside, because a menu you can only
//     shut by finding the same small button again is a trap on a phone.
//
// Same contract as every other renderer: pure (fields) -> html.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// A logo is above the fold by definition, so it is never lazy — a deferred
// logo is discovered late and shifts the whole header when it lands.
const EAGER = 'decoding="async" fetchpriority="high"';

const clampHeight = (v) => Math.min(72, Math.max(16, Number(v) || 32));

/**
 * The brand mark: the logo image if there is one, the site name if not.
 *
 * Always wrapped in a link home. The alt text is the site name rather than
 * "logo" — a screen reader announcing "logo, link" tells you nothing about
 * where it goes, and the name is what a sighted user reads there.
 */
function brand(fields, className = 'nv-brand') {
  const name = fields.headings?.[0] || '';
  const logo = fields.images?.[0];
  const h = clampHeight(fields.logoHeight);
  const inner = logo
    ? `<img ${EAGER} src="${esc(logo.src)}" alt="${esc(logo.alt || name || 'Home')}" style="height:${h}px" />`
    : `<span>${esc(name)}</span>`;
  return `<a class="${className}" href="${esc(fields.homeHref || '/')}">${inner}</a>`;
}

// These are function declarations rather than arrows on purpose: the block
// audit slices renderer bodies by `function NAME(`, so a helper written as a
// const arrow is invisible to it and every field reached only through that
// helper reports as a dead editor.
function navLinks(links = []) {
  return (links || [])
    .map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label || l.href || 'Link')}</a>`).join('');
}

function cta(fields) {
  return fields.ctaLabel
    ? `<a class="nv-cta" href="${esc(fields.ctaHref || '#')}">${esc(fields.ctaLabel)}</a>` : '';
}

function toggle(label = 'Menu') {
  return `<button class="nv-burger" type="button" data-nv-toggle aria-expanded="false" aria-label="${esc(label)}">
  <span></span><span></span><span></span>
</button>`;
}

// Shared chrome. Hoisted once by extractSharedStyles when a page uses more
// than one nav block, which a page shouldn't, but templates get remixed.
const NAV_CSS = `
.nv { background:var(--color-bg); border-bottom:1px solid var(--border); }
.nv[data-sticky="1"] { position:sticky; top:0; z-index:100; }
.nv-in { max-width:1240px; margin:0 auto; padding:14px 24px; display:flex; align-items:center; gap:20px; }
.nv-brand { display:inline-flex; align-items:center; text-decoration:none; color:var(--color-text); font-family:var(--font-display); font-weight:700; font-size:19px; letter-spacing:-.02em; flex:none; }
.nv-brand img { display:block; width:auto; object-fit:contain; }
.nv-links { display:none; gap:22px; align-items:center; }
.nv-links a { color:var(--color-text); text-decoration:none; font-size:15px; }
.nv-links a:hover { color:var(--color-link); }
.nv-cta { flex:none; background:var(--color-accent); color:var(--on-accent,#fff); text-decoration:none; font-weight:600; font-size:14.5px; padding:11px 18px; border-radius:6px; white-space:nowrap; }
.nv-burger { margin-left:auto; width:42px; height:42px; display:flex; flex-direction:column; justify-content:center; gap:5px; padding:0 9px; background:none; border:1px solid var(--border); border-radius:8px; cursor:pointer; }
.nv-burger span { display:block; height:2px; background:var(--color-text); border-radius:2px; transition:transform .2s, opacity .2s; }
.nv-burger[aria-expanded="true"] span:nth-child(1) { transform:translateY(7px) rotate(45deg); }
.nv-burger[aria-expanded="true"] span:nth-child(2) { opacity:0; }
.nv-burger[aria-expanded="true"] span:nth-child(3) { transform:translateY(-7px) rotate(-45deg); }
.nv-panel { display:none; flex-direction:column; gap:2px; padding:8px 24px 20px; border-top:1px solid var(--border); }
.nv-panel[data-open="1"] { display:flex; }
.nv-panel a { color:var(--color-text); text-decoration:none; font-size:16px; padding:12px 0; border-bottom:1px solid var(--border); }
.nv-panel .nv-cta { margin-top:12px; text-align:center; border-bottom:none; }
@media (min-width:900px){
  .nv-links { display:flex; }
  .nv-burger { display:none; }
  .nv-panel { display:none !important; }
}
`;

// The toggle script, shared verbatim by the four bars that have one. Written
// as a string rather than a helper import because renderers ship their own
// inline script and the CSP pins its hash.
const TOGGLE_JS = `
(function(){
  var root = document.currentScript.previousElementSibling;
  if(!root) return;
  var btn = root.querySelector('[data-nv-toggle]');
  var panel = root.querySelector('[data-nv-panel]');
  if(!btn || !panel) return;
  function set(open){
    btn.setAttribute('aria-expanded', String(open));
    panel.setAttribute('data-open', open ? '1' : '0');
  }
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    set(btn.getAttribute('aria-expanded') !== 'true');
  });
  // Escape and click-outside both close it. A menu you can only shut by
  // finding the same small button again is a trap on a phone.
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') set(false); });
  document.addEventListener('click', function(e){ if(!root.contains(e.target)) set(false); });
  // Following a link should not leave the panel open behind the new page in
  // a client-side-routed site.
  panel.addEventListener('click', function(e){ if(e.target.closest('a')) set(false); });
})();`;

function panel(fields) {
  return `<div class="nv-panel" data-nv-panel data-open="0">
  ${navLinks(fields.links)}
  ${cta(fields)}
</div>`;
}

// Sticky by default: an unset field means the author never touched it, and a
// nav that scrolls away is the less useful of the two defaults.
function stickyAttr(fields) {
  return fields.sticky === false ? '0' : '1';
}

// 1 — Logo left, links right, optional call to action. The default arrangement
// for most of the web, and the one to reach for when nothing argues otherwise.
export function renderNavLogo(fields) {
  return `<style>${NAV_CSS}
.nv-logo .nv-links { margin-left:auto; }
</style>
<header class="nv nv-logo" data-sticky="${stickyAttr(fields)}">
  <div class="nv-in">
    ${brand(fields)}
    <nav class="nv-links">${navLinks(fields.links)}</nav>
    ${cta(fields)}
    ${toggle()}
  </div>
  ${panel(fields)}
</header>
<script>${TOGGLE_JS}</script>`;
}

// 2 — Centred logo with the links split either side. Reads as considered
// rather than default, which is why editorial, fashion and property sites
// keep choosing it. Splits on the midpoint so an odd number leans left.
export function renderNavCenter(fields) {
  const links = fields.links || [];
  const half = Math.ceil(links.length / 2);
  return `<style>${NAV_CSS}
.nv-center .nv-in { justify-content:space-between; }
.nv-center .nv-brand { font-size:21px; }
.nv-center .nv-side { display:none; gap:22px; align-items:center; flex:1; }
.nv-center .nv-side a { color:var(--color-text); text-decoration:none; font-size:15px; }
.nv-center .nv-side a:hover { color:var(--color-link); }
.nv-center .nv-side.nv-right { justify-content:flex-end; }
@media (min-width:900px){ .nv-center .nv-side { display:flex; } .nv-center .nv-in { padding:18px 24px; } }
</style>
<header class="nv nv-center" data-sticky="${stickyAttr(fields)}">
  <div class="nv-in">
    <nav class="nv-side nv-left">${navLinks(links.slice(0, half))}</nav>
    ${brand(fields)}
    <nav class="nv-side nv-right">${navLinks(links.slice(half))}</nav>
    ${toggle()}
  </div>
  ${panel(fields)}
</header>
<script>${TOGGLE_JS}</script>`;
}

// 3 — A thin utility strip above the main bar. Where a local business puts
// the phone number, licence line and hours: details that matter to the
// people who call but would clutter the main navigation.
export function renderNavUtility(fields) {
  const strip = (fields.text || []).slice(0, 2)
    .map((t) => `<span>${esc(t)}</span>`).join('');
  const util = (fields.items || []).slice(0, 4)
    .map((i) => `<a href="${esc(i.link || '#')}">${esc(i.heading || i.link || '')}</a>`).join('');
  return `<style>${NAV_CSS}
.nv-util-bar { background:var(--color-primary); color:#fff; font-size:12.5px; }
.nv-util-in { max-width:1240px; margin:0 auto; padding:8px 24px; display:flex; flex-wrap:wrap; align-items:center; gap:8px 18px; }
.nv-util-in a { color:#fff; text-decoration:none; }
.nv-util-in a:hover { text-decoration:underline; }
.nv-util-in .nv-util-right { margin-left:auto; display:flex; flex-wrap:wrap; gap:8px 18px; }
.nv-utility .nv-links { margin-left:auto; }
</style>
<header class="nv nv-utility" data-sticky="${stickyAttr(fields)}">
  ${strip || util ? `<div class="nv-util-bar"><div class="nv-util-in">
    ${strip}
    ${util ? `<div class="nv-util-right">${util}</div>` : ''}
  </div></div>` : ''}
  <div class="nv-in">
    ${brand(fields)}
    <nav class="nv-links">${navLinks(fields.links)}</nav>
    ${cta(fields)}
    ${toggle()}
  </div>
  ${panel(fields)}
</header>
<script>${TOGGLE_JS}</script>`;
}

// 4 — Transparent over a full-bleed hero, solid once you scroll past it.
//
// Pairs with hero-video and the like. It starts see-through with light text,
// so it needs an inverted logo; supply a second image and that one is used
// while transparent. With only one logo the same file is used throughout,
// which is right for a mark that reads on both.
export function renderNavOverlay(fields) {
  const light = fields.images?.[1] || fields.images?.[0];
  const name = fields.headings?.[0] || '';
  const h = clampHeight(fields.logoHeight);
  const solidAt = Math.max(0, Number(fields.solidAfter) || 80);
  const markFor = (img) => (img
    ? `<img ${EAGER} src="${esc(img.src)}" alt="${esc(img.alt || name || 'Home')}" style="height:${h}px" />`
    : `<span>${esc(name)}</span>`);
  return `<style>${NAV_CSS}
.nv-overlay { position:fixed; top:0; left:0; right:0; z-index:110; background:transparent; border-bottom:1px solid transparent; transition:background .25s, border-color .25s, box-shadow .25s; }
.nv-overlay .nv-brand, .nv-overlay .nv-links a { color:#fff; }
.nv-overlay .nv-burger { border-color:rgba(255,255,255,.4); }
.nv-overlay .nv-burger span { background:#fff; }
.nv-overlay .nv-mark-solid { display:none; }
.nv-overlay[data-solid="1"] { background:var(--color-bg); border-bottom-color:var(--border); box-shadow:0 1px 12px rgba(0,0,0,.07); }
.nv-overlay[data-solid="1"] .nv-brand, .nv-overlay[data-solid="1"] .nv-links a { color:var(--color-text); }
.nv-overlay[data-solid="1"] .nv-burger { border-color:var(--border); }
.nv-overlay[data-solid="1"] .nv-burger span { background:var(--color-text); }
.nv-overlay[data-solid="1"] .nv-mark-solid { display:block; }
.nv-overlay[data-solid="1"] .nv-mark-light { display:none; }
.nv-overlay .nv-panel { background:var(--color-bg); }
.nv-overlay .nv-panel a { color:var(--color-text); }
</style>
<header class="nv nv-overlay" data-solid="0" data-solid-after="${esc(solidAt)}">
  <div class="nv-in">
    <a class="nv-brand" href="${esc(fields.homeHref || '/')}">
      <span class="nv-mark-light">${markFor(light)}</span>
      <span class="nv-mark-solid">${markFor(fields.images?.[0])}</span>
    </a>
    <nav class="nv-links">${navLinks(fields.links)}</nav>
    ${cta(fields)}
    ${toggle()}
  </div>
  ${panel(fields)}
</header>
<script>
(function(){
  var root = document.currentScript.previousElementSibling;
  if(!root) return;
  var btn = root.querySelector('[data-nv-toggle]');
  var panel = root.querySelector('[data-nv-panel]');
  var after = Number(root.getAttribute('data-solid-after')) || 80;
  function set(open){
    btn.setAttribute('aria-expanded', String(open));
    panel.setAttribute('data-open', open ? '1' : '0');
    // An open menu over a transparent bar is unreadable, so opening it also
    // makes the bar solid; scrolling decides again once it closes.
    if(open) root.setAttribute('data-solid','1'); else frame();
  }
  var ticking = false;
  function frame(){
    ticking = false;
    var solid = scrollY > after || panel.getAttribute('data-open') === '1';
    root.setAttribute('data-solid', solid ? '1' : '0');
  }
  addEventListener('scroll', function(){
    if(!ticking){ ticking = true; requestAnimationFrame(frame); }
  }, { passive:true });
  if(btn && panel){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      set(btn.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') set(false); });
    document.addEventListener('click', function(e){ if(!root.contains(e.target)) set(false); });
    panel.addEventListener('click', function(e){ if(e.target.closest('a')) set(false); });
  }
  frame();
})();
</script>`;
}

// 5 — Logo and a menu button, nothing else, at every width. The links live in
// a full-screen overlay. Deliberately not a mobile pattern bolted onto a
// desktop bar: it is the whole design, for sites with few pages and a lot of
// photography that shouldn't compete with a link row.
export function renderNavDrawer(fields) {
  return `<style>${NAV_CSS}
.nv-drawer .nv-in { justify-content:space-between; }
.nv-drawer .nv-burger { display:flex; margin-left:0; }
.nv-sheet { position:fixed; inset:0; z-index:120; background:var(--color-primary); color:#fff; display:flex; flex-direction:column; justify-content:center; padding:32px 28px; transform:translateY(-100%); transition:transform .32s cubic-bezier(.4,0,.2,1); }
.nv-sheet[data-open="1"] { transform:translateY(0); }
.nv-sheet a { color:#fff; text-decoration:none; font-family:var(--font-display); font-size:clamp(26px,7vw,44px); letter-spacing:-.02em; padding:10px 0; display:block; }
.nv-sheet a:hover { color:var(--color-accent); }
.nv-sheet .nv-cta { display:inline-block; font-size:16px; margin-top:24px; align-self:flex-start; }
.nv-sheet-close { position:absolute; top:18px; right:20px; width:44px; height:44px; background:none; border:1px solid rgba(255,255,255,.35); border-radius:8px; color:#fff; font-size:22px; line-height:1; cursor:pointer; }
</style>
<header class="nv nv-drawer" data-sticky="${stickyAttr(fields)}">
  <div class="nv-in">
    ${brand(fields)}
    ${toggle('Open menu')}
  </div>
  <div class="nv-sheet" data-nv-panel data-open="0" role="dialog" aria-modal="true" aria-label="Menu">
    <button class="nv-sheet-close" type="button" data-nv-close aria-label="Close menu">&times;</button>
    <nav>${navLinks(fields.links)}</nav>
    ${cta(fields)}
  </div>
</header>
<script>
(function(){
  var root = document.currentScript.previousElementSibling;
  if(!root) return;
  var btn = root.querySelector('[data-nv-toggle]');
  var sheet = root.querySelector('[data-nv-panel]');
  var close = root.querySelector('[data-nv-close]');
  if(!btn || !sheet) return;
  function set(open){
    btn.setAttribute('aria-expanded', String(open));
    sheet.setAttribute('data-open', open ? '1' : '0');
    // The sheet covers the page, so the page behind it must not scroll —
    // otherwise closing it drops you somewhere you never chose to be.
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if(open) (sheet.querySelector('a') || close).focus();
    else btn.focus();
  }
  btn.addEventListener('click', function(){ set(true); });
  close.addEventListener('click', function(){ set(false); });
  sheet.addEventListener('click', function(e){ if(e.target.closest('a')) set(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && sheet.getAttribute('data-open') === '1') set(false); });
})();
</script>`;
}
