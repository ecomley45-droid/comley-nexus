// Per-section design tokens — the data behind the page editor's "Design"
// inspector (Alignment / Layout / Spacing / Background / Border / Text /
// Effects / Responsive).
//
// Why tokens instead of CSS text: a section's `style` is a small, closed
// object of enums, numbers and colors. That makes it (a) editable with
// sliders and segmented buttons rather than a code box, (b) safely
// validatable server-side — normalizeSectionStyle() below drops anything
// that isn't a known key with an in-range value, so nothing a user types
// can break out of the <style> block that compilePageHtml emits.
//
// Design lives at the SECTION level, not inside `fields`, on purpose: it
// then applies uniformly to every block — catalog blocks, pasted-in blocks,
// and hand-written raw HTML sections alike — and the CSS is generated once
// at compile time against the `data-section-id` attribute compilePageHtml
// already writes. A section with no `style` emits no CSS at all, so pages
// built before this existed compile byte-identically.

// ---------------------------------------------------------------------------
// Vocabulary (also drives the inspector's UI — single source of truth)
// ---------------------------------------------------------------------------

export const DIRECTIONS = { vertical: 'Stack', horizontal: 'Row' };

export const ALIGN_X = { start: 'Left', center: 'Center', end: 'Right', stretch: 'Fill' };
export const ALIGN_Y = { start: 'Top', center: 'Middle', end: 'Bottom', between: 'Space between' };

export const TEXT_ALIGN = { left: 'Left', center: 'Center', right: 'Right', justify: 'Justify' };

export const WIDTH_PRESETS = {
  full: { label: 'Full width', maxWidth: null },
  wide: { label: 'Wide', maxWidth: '1200px' },
  medium: { label: 'Medium', maxWidth: '960px' },
  narrow: { label: 'Narrow', maxWidth: '680px' },
};

export const SHADOWS = {
  none: { label: 'None', value: 'none' },
  sm: { label: 'Subtle', value: '0 1px 3px rgba(0,0,0,0.14)' },
  md: { label: 'Medium', value: '0 6px 18px rgba(0,0,0,0.18)' },
  lg: { label: 'Large', value: '0 14px 38px rgba(0,0,0,0.24)' },
  xl: { label: 'Dramatic', value: '0 28px 70px rgba(0,0,0,0.32)' },
};

export const BG_SIZES = { cover: 'Cover', contain: 'Contain', auto: 'Actual size' };
export const BG_POSITIONS = { center: 'Center', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };

export const ANIMATIONS = {
  none: { label: 'None', css: null },
  'fade-in': { label: 'Fade in', css: 'nx-anim-fade' },
  'fade-up': { label: 'Fade up', css: 'nx-anim-up' },
  'fade-down': { label: 'Fade down', css: 'nx-anim-down' },
  'zoom-in': { label: 'Zoom in', css: 'nx-anim-zoom' },
  'slide-left': { label: 'Slide from left', css: 'nx-anim-left' },
  'slide-right': { label: 'Slide from right', css: 'nx-anim-right' },
};

// Breakpoints shared by the generated CSS and the editor's device switcher,
// so "what you see on the Tablet preview" is literally the rule that ships.
export const BREAKPOINTS = { tablet: 1024, mobile: 640 };

// Fields a per-device override may carry. Deliberately a subset of the
// desktop token set — the things that actually need to change per screen.
export const RESPONSIVE_FIELDS = [
  'direction', 'alignX', 'alignY', 'gap', 'textAlign',
  'padding', 'margin', 'minHeight', 'fontScale', 'width',
];

// ---------------------------------------------------------------------------
// Validation primitives. Every value that reaches generated CSS goes through
// one of these — an unknown enum, an out-of-range number or an unparseable
// color is dropped, never passed through.
// ---------------------------------------------------------------------------

const oneOf = (value, allowed) => (allowed.includes(value) ? value : undefined);

const clampInt = (value, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const clampFloat = (value, min, max, decimals = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Number(Math.min(max, Math.max(min, n)).toFixed(decimals));
};

// #rgb / #rrggbb / #rrggbbaa, rgb()/rgba() with only numeric innards, the
// CSS-wide keyword `transparent`, plain color keywords, and `var(--x)` so a
// picker can point at the workspace theme. Anything else — including
// anything containing a quote, semicolon, brace or url() — is rejected.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_FN = /^rgba?\(\s*[\d.\s,%/]+\)$/i;
const KEYWORD = /^[a-z]{3,20}$/i;
const THEME_VAR = /^var\(--[a-z0-9-]{1,40}\)$/i;

const cssColor = (value) => {
  const v = String(value ?? '').trim();
  if (!v) return undefined;
  if (HEX.test(v) || RGB_FN.test(v) || KEYWORD.test(v) || THEME_VAR.test(v)) return v;
  return undefined;
};

// Background images: same-origin/relative paths, http(s) URLs, and data:
// image URIs. Any character that could terminate the url() or the rule is
// rejected outright rather than escaped.
const cssUrl = (value) => {
  const v = String(value ?? '').trim();
  if (!v) return undefined;
  if (/["'()\\;{}<>\s]/.test(v)) return undefined;
  if (/^https?:\/\//i.test(v) || v.startsWith('/') || /^data:image\/[a-z+]+;base64,[a-z0-9+/=]+$/i.test(v)) return v;
  return undefined;
};

const boxOf = (value, min, max) => {
  if (!value || typeof value !== 'object') return undefined;
  const out = {};
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const n = clampInt(value[side], min, max);
    if (n !== undefined) out[side] = n;
  }
  return Object.keys(out).length ? out : undefined;
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeCore(style, fields) {
  const s = style && typeof style === 'object' ? style : {};
  const out = {};
  const put = (key, value) => { if (value !== undefined) out[key] = value; };
  const want = (key) => !fields || fields.includes(key);

  if (want('direction')) put('direction', oneOf(s.direction, Object.keys(DIRECTIONS)));
  if (want('alignX')) put('alignX', oneOf(s.alignX, Object.keys(ALIGN_X)));
  if (want('alignY')) put('alignY', oneOf(s.alignY, Object.keys(ALIGN_Y)));
  if (want('gap')) put('gap', clampInt(s.gap, 0, 200));
  if (want('textAlign')) put('textAlign', oneOf(s.textAlign, Object.keys(TEXT_ALIGN)));
  if (want('width')) put('width', oneOf(s.width, Object.keys(WIDTH_PRESETS)));
  if (want('minHeight')) put('minHeight', clampInt(s.minHeight, 0, 2000));
  if (want('padding')) put('padding', boxOf(s.padding, 0, 400));
  if (want('margin')) put('margin', boxOf(s.margin, -200, 400));
  if (want('fontScale')) put('fontScale', clampFloat(s.fontScale, 0.6, 2.5));

  return out;
}

// Returns a clean style object, or `undefined` when nothing survives — so
// untouched sections stay exactly as they were on disk.
export function normalizeSectionStyle(style) {
  if (!style || typeof style !== 'object') return undefined;
  const out = normalizeCore(style, null);
  const put = (key, value) => { if (value !== undefined) out[key] = value; };

  put('bgColor', cssColor(style.bgColor));
  put('bgImage', cssUrl(style.bgImage));
  put('bgSize', oneOf(style.bgSize, Object.keys(BG_SIZES)));
  put('bgPosition', oneOf(style.bgPosition, Object.keys(BG_POSITIONS)));
  put('bgOverlay', clampInt(style.bgOverlay, 0, 100));
  put('bgOverlayColor', cssColor(style.bgOverlayColor));

  put('radius', clampInt(style.radius, 0, 200));
  put('borderWidth', clampInt(style.borderWidth, 0, 40));
  put('borderColor', cssColor(style.borderColor));
  put('shadow', oneOf(style.shadow, Object.keys(SHADOWS)));

  put('textColor', cssColor(style.textColor));
  put('headingColor', cssColor(style.headingColor));
  put('linkColor', cssColor(style.linkColor));

  put('opacity', clampInt(style.opacity, 0, 100));
  put('animation', oneOf(style.animation, Object.keys(ANIMATIONS)));

  if (style.hideOn && typeof style.hideOn === 'object') {
    const hideOn = {};
    for (const device of ['desktop', 'tablet', 'mobile']) {
      if (style.hideOn[device] === true) hideOn[device] = true;
    }
    if (Object.keys(hideOn).length) out.hideOn = hideOn;
  }

  for (const device of ['tablet', 'mobile']) {
    const override = normalizeCore(style[device], RESPONSIVE_FIELDS);
    if (Object.keys(override).length) out[device] = override;
  }

  // `animation: 'none'` and friends are meaningful-but-inert; strip them so
  // a section the user opened and closed without changing anything doesn't
  // start carrying a style object.
  if (out.animation === 'none') delete out.animation;
  return Object.keys(out).length ? out : undefined;
}

export function hasSectionStyle(style) {
  return normalizeSectionStyle(style) !== undefined;
}

// ---------------------------------------------------------------------------
// CSS generation
// ---------------------------------------------------------------------------

const FLEX_MAIN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', between: 'space-between' };

// The declarations that a core (device-independent) token set produces.
// `root` is false for responsive overrides, which only re-declare what the
// override actually sets.
function coreDeclarations(s) {
  const d = [];
  const direction = s.direction;
  const isRow = direction === 'horizontal';

  // Any of these turns the section into a flex container. Untouched
  // sections stay plain block-level, so nothing about existing pages moves.
  const needsFlex = s.direction || s.alignX || s.alignY || s.gap !== undefined;
  if (needsFlex) {
    d.push('display:flex');
    d.push(`flex-direction:${isRow ? 'row' : 'column'}`);
    d.push('flex-wrap:wrap');
    if (s.alignX) d.push(`${isRow ? 'justify-content' : 'align-items'}:${FLEX_MAIN[s.alignX]}`);
    if (s.alignY) d.push(`${isRow ? 'align-items' : 'justify-content'}:${FLEX_MAIN[s.alignY]}`);
    if (s.gap !== undefined) d.push(`gap:${s.gap}px`);
  }

  if (s.padding) {
    for (const [side, value] of Object.entries(s.padding)) d.push(`padding-${side}:${value}px`);
  }
  if (s.margin) {
    for (const [side, value] of Object.entries(s.margin)) d.push(`margin-${side}:${value}px`);
  }
  if (s.textAlign) d.push(`text-align:${s.textAlign}`);
  if (s.minHeight !== undefined) d.push(`min-height:${s.minHeight}px`);
  if (s.fontScale !== undefined) d.push(`font-size:${s.fontScale}em`);

  if (s.width) {
    const preset = WIDTH_PRESETS[s.width];
    if (preset?.maxWidth) {
      d.push(`max-width:${preset.maxWidth}`);
      d.push('margin-left:auto');
      d.push('margin-right:auto');
    } else {
      d.push('max-width:none');
    }
  }
  return d;
}

function rootDeclarations(s) {
  const d = coreDeclarations(s);

  if (s.bgColor) d.push(`background-color:${s.bgColor}`);
  if (s.bgImage) {
    d.push(`background-image:url(${s.bgImage})`);
    d.push(`background-size:${s.bgSize || 'cover'}`);
    d.push(`background-position:${s.bgPosition || 'center'}`);
    d.push('background-repeat:no-repeat');
  }
  if (s.radius !== undefined) {
    d.push(`border-radius:${s.radius}px`);
    d.push('overflow:hidden');
  }
  if (s.borderWidth) {
    d.push(`border:${s.borderWidth}px solid ${s.borderColor || 'currentColor'}`);
  }
  if (s.shadow && s.shadow !== 'none') d.push(`box-shadow:${SHADOWS[s.shadow].value}`);
  if (s.textColor) d.push(`color:${s.textColor}`);
  if (s.opacity !== undefined && s.opacity < 100) d.push(`opacity:${(s.opacity / 100).toFixed(2)}`);

  // An overlay needs a stacking context and a positioned pseudo-element.
  if (s.bgOverlay) d.push('position:relative');
  return d;
}

const rule = (selector, declarations) =>
  (declarations.length ? `${selector}{${declarations.join(';')}}` : '');

// `data-section-id` values are generated ids, but a hand-edited or imported
// page could carry anything — restrict to what's safe inside an attribute
// selector rather than trying to escape it.
const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * CSS for one section's design tokens, scoped to its `data-section-id`.
 * Returns '' when the section has no (valid) style, so callers can join
 * freely without producing empty <style> noise.
 */
export function buildSectionStyleCss(sectionId, style, { selector } = {}) {
  const s = normalizeSectionStyle(style);
  if (!s) return '';
  const scope = selector || (SAFE_ID.test(String(sectionId || '')) ? `[data-section-id="${sectionId}"]` : '');
  if (!scope) return '';

  const out = [];
  out.push(rule(scope, rootDeclarations(s)));

  if (s.headingColor) out.push(rule(`${scope} :is(h1,h2,h3,h4,h5,h6)`, [`color:${s.headingColor}`]));
  if (s.linkColor) out.push(rule(`${scope} a`, [`color:${s.linkColor}`]));

  if (s.bgOverlay) {
    const overlay = s.bgOverlayColor || '#000000';
    out.push(rule(`${scope}::before`, [
      'content:""', 'position:absolute', 'inset:0', 'pointer-events:none',
      `background:${overlay}`, `opacity:${(s.bgOverlay / 100).toFixed(2)}`, 'z-index:0',
    ]));
    out.push(rule(`${scope} > *`, ['position:relative', 'z-index:1']));
  }

  if (s.animation && ANIMATIONS[s.animation]?.css) {
    out.push(rule(scope, [`animation:${ANIMATIONS[s.animation].css} .7s cubic-bezier(.22,.61,.36,1) both`]));
  }

  // Responsive overrides, narrowest last so mobile wins over tablet.
  for (const device of ['tablet', 'mobile']) {
    const override = s[device];
    if (!override) continue;
    // alignX/alignY map to different CSS properties depending on the
    // direction (justify-content vs align-items). So an override that only
    // flips the direction has to re-emit the inherited alignment too --
    // otherwise "centred, side by side" on desktop silently becomes
    // "vertically centred, not horizontally" once mobile stacks it. Only
    // the flex group is merged; everything else stays override-only.
    const touchesFlex = override.direction || override.alignX || override.alignY || override.gap !== undefined;
    const source = touchesFlex
      ? {
          ...override,
          direction: override.direction ?? s.direction,
          alignX: override.alignX ?? s.alignX,
          alignY: override.alignY ?? s.alignY,
          gap: override.gap ?? s.gap,
        }
      : override;
    const declarations = coreDeclarations(source);
    if (!declarations.length) continue;
    out.push(`@media (max-width:${BREAKPOINTS[device]}px){${rule(scope, declarations)}}`);
  }

  if (s.hideOn?.desktop) out.push(`@media (min-width:${BREAKPOINTS.tablet + 1}px){${rule(scope, ['display:none'])}}`);
  if (s.hideOn?.tablet) {
    out.push(`@media (min-width:${BREAKPOINTS.mobile + 1}px) and (max-width:${BREAKPOINTS.tablet}px){${rule(scope, ['display:none'])}}`);
  }
  if (s.hideOn?.mobile) out.push(`@media (max-width:${BREAKPOINTS.mobile}px){${rule(scope, ['display:none'])}}`);

  return out.filter(Boolean).join('\n');
}

// Emitted once per page, only when some section actually animates.
export const ANIMATION_KEYFRAMES = `@media (prefers-reduced-motion:no-preference){
@keyframes nx-anim-fade{from{opacity:0}to{opacity:1}}
@keyframes nx-anim-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes nx-anim-down{from{opacity:0;transform:translateY(-24px)}to{opacity:1;transform:none}}
@keyframes nx-anim-zoom{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes nx-anim-left{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:none}}
@keyframes nx-anim-right{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}
}
@media (prefers-reduced-motion:reduce){
@keyframes nx-anim-fade{from{opacity:1}to{opacity:1}}
@keyframes nx-anim-up{from{opacity:1}to{opacity:1}}
@keyframes nx-anim-down{from{opacity:1}to{opacity:1}}
@keyframes nx-anim-zoom{from{opacity:1}to{opacity:1}}
@keyframes nx-anim-left{from{opacity:1}to{opacity:1}}
@keyframes nx-anim-right{from{opacity:1}to{opacity:1}}
}`;

/**
 * All design CSS for a page's sections, plus the animation keyframes if any
 * section uses one. Returns '' for a page whose sections carry no design.
 */
export function buildPageStyleCss(sections = []) {
  const parts = [];
  let animated = false;
  for (const section of sections) {
    const css = buildSectionStyleCss(section?.id, section?.style);
    if (!css) continue;
    parts.push(css);
    if (normalizeSectionStyle(section.style)?.animation) animated = true;
  }
  if (!parts.length) return '';
  return (animated ? `${ANIMATION_KEYFRAMES}\n` : '') + parts.join('\n');
}

// A short human summary of what a section's design overrides — shown next to
// the block in the editor's layer list so it's obvious at a glance which
// blocks have been customized.
export function describeSectionStyle(style) {
  const s = normalizeSectionStyle(style);
  if (!s) return '';
  const bits = [];
  if (s.direction === 'horizontal') bits.push('row');
  if (s.alignX || s.alignY || s.textAlign) bits.push('aligned');
  if (s.padding || s.margin) bits.push('spacing');
  if (s.bgColor || s.bgImage) bits.push('background');
  if (s.borderWidth || s.radius !== undefined || (s.shadow && s.shadow !== 'none')) bits.push('border');
  if (s.animation) bits.push('animated');
  if (s.hideOn) bits.push('hidden on some screens');
  if (s.tablet || s.mobile) bits.push('responsive');
  return bits.slice(0, 3).join(' · ');
}
