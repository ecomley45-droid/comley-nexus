// Single source of truth for turning a workspace's theme choices into CSS.
// Used both by compilePage.js (the real published-page compiler, server AND
// client-side for the live page-editor preview) and by the theme wizard's
// own mockup preview -- both need byte-identical output from the same
// `theme` object, so the CSS-variable generation lives here once rather
// than being duplicated.
//
// Fonts are fixed, curated web-safe stacks (not raw user-entered font-family
// strings) so every combination is guaranteed to render without depending on
// an external font CDN -- see FONT_STACKS keys for the full list shown in
// the UI.

// `webfont` is the Google Fonts family spec to load. Stacks without one are
// device fonts and cost nothing; the rest are only fetched by pages whose
// theme actually selects them (see webfontHref below), so adding options here
// doesn't slow down sites that don't use them.
export const FONT_STACKS = {
  system: { label: 'Clean Sans', value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  serif: { label: 'Serif', value: "Georgia, 'Times New Roman', serif" },
  mono: { label: 'Mono', value: "'Courier New', Courier, monospace" },
  rounded: { label: 'Rounded Sans', value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  classic: { label: 'Classic Serif', value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },

  // Web fonts. Each keeps a device-font fallback so a blocked or slow
  // Google Fonts request degrades to something readable rather than nothing.
  grotesk: {
    label: 'Familjen Grotesk', webfont: 'Familjen+Grotesk:wght@400;500;600;700',
    value: "'Familjen Grotesk', system-ui, -apple-system, sans-serif",
  },
  sourceserif: {
    label: 'Source Serif', webfont: 'Source+Serif+4:opsz,wght@8..60,400;8..60,600',
    value: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  },
  plexmono: {
    label: 'IBM Plex Mono', webfont: 'IBM+Plex+Mono:wght@400;500',
    value: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace",
  },
  inter: {
    label: 'Inter', webfont: 'Inter:wght@400;500;600;700',
    value: "'Inter', system-ui, -apple-system, sans-serif",
  },
};

export const FONT_SCALES = {
  compact: { label: 'Compact', h1: '2rem', h2: '1.5rem', h3: '1.15rem', body: '0.9375rem', small: '0.8125rem' },
  comfortable: { label: 'Comfortable', h1: '2.5rem', h2: '1.75rem', h3: '1.25rem', body: '1rem', small: '0.875rem' },
  spacious: { label: 'Spacious', h1: '3rem', h2: '2rem', h3: '1.4rem', body: '1.0625rem', small: '0.9375rem' },
};

const DEFAULT_THEME = {
  primary: '#6366f1',
  secondary: '#d946ef',
  bg: '#070a13',
  text: '#e2e8f0',
  accent: '#6366f1',
  link: '#a5b4fc',
  muted: '#a1a1aa',
  fontFamily: 'system',
  fontScale: 'comfortable',
};

// Parse a #rgb/#rrggbb hex into {r,g,b} (0-255), or null if unparseable.
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
// Relative luminance (0 dark .. 1 light), good enough for a light/dark split.
function luminance({ r, g, b }) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }

// WCAG relative luminance — gamma-corrected, unlike the linear approximation
// above. Needed wherever the answer is "is this readable", as opposed to
// "is this broadly light or dark".
function wcagLuminance({ r, g, b }) {
  const ch = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

const contrast = (a, b) => {
  const [hi, lo] = [wcagLuminance(a), wcagLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Is this theme's background light? Used by the theme wizard to filter
// presets and label the light/dark toggle. Defaults to dark for an
// unparseable/missing bg (the platform default).
export function isLightTheme(theme = {}) {
  const bg = hexToRgb(theme.bg);
  return bg ? luminance(bg) > 0.5 : false;
}

// Derives light/dark-aware helper variables from the theme's own background
// and accent, so blocks can style surfaces, borders, and text-on-accent
// without hardcoding "assume dark". Dark-theme values match the historical
// literals the nx-* blocks used, so existing dark pages render identically.
function deriveSurfaceVars(t) {
  const bg = hexToRgb(t.bg) || { r: 7, g: 10, b: 19 };
  const accent = hexToRgb(t.accent) || hexToRgb(t.primary) || { r: 99, g: 102, b: 241 };
  const isLight = luminance(bg) > 0.5;
  return {
    scheme: isLight ? 'light' : 'dark',
    surface: isLight ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)',
    surfaceStrong: isLight ? 'rgba(0,0,0,0.055)' : 'rgba(255,255,255,0.06)',
    border: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)',
    // Readable text colour to place on top of the accent colour.
    //
    // Was `luminance(accent) > 0.6 ? dark : white`, which is a brightness
    // guess, not a readability test — and it got mid-tone accents wrong in
    // the direction that matters. A brass #C08A2E scored 0.56 and so took
    // white text at 3.0:1, under the 4.5:1 floor, when black would have given
    // 6.2:1. Picking whichever of the two actually contrasts more is both
    // simpler and correct for every accent.
    onAccent: contrast({ r: 17, g: 17, b: 17 }, accent) >= contrast({ r: 255, g: 255, b: 255 }, accent)
      ? '#111111' : '#ffffff',
    // A soft tint of the accent, for banners/pills -- adapts to the theme.
    accentSoft: `rgba(${accent.r},${accent.g},${accent.b},0.12)`,
  };
}

// Returns the `:root { --color-*: ...; --font-*: ...; --text-*: ...; }` +
// base `body` rule string for a theme object. Falls back field-by-field so
// an org that only ever set the original 4 colors (primary/secondary/bg/text)
// still renders correctly once accent/link/muted/fontFamily/fontScale exist.
export function buildThemeStyleBlock(theme = {}) {
  const t = { ...DEFAULT_THEME, ...theme };
  // Three type roles, not one. A single --font-body couldn't express a design
  // that pairs a display face for headings with a serif for reading and a mono
  // for small caps labels, which is most editorial layouts. Display and mono
  // fall back to the body font when unset, so a theme that only picks one
  // family behaves exactly as it did before.
  const stackFor = (key, fallback) => (FONT_STACKS[key] || fallback).value;
  const bodyStack = stackFor(t.fontFamily, FONT_STACKS.system);
  const displayStack = t.fontDisplay ? stackFor(t.fontDisplay, FONT_STACKS.system) : bodyStack;
  const monoStack = t.fontMono ? stackFor(t.fontMono, FONT_STACKS.mono) : bodyStack;
  const scale = FONT_SCALES[t.fontScale] || FONT_SCALES.comfortable;
  const s = deriveSurfaceVars(t);

  return `:root {
  --color-primary: ${t.primary};
  --color-secondary: ${t.secondary};
  --color-bg: ${t.bg};
  --color-text: ${t.text};
  --color-accent: ${t.accent};
  --color-link: ${t.link};
  --color-muted: ${t.muted};
  --surface: ${s.surface};
  --surface-strong: ${s.surfaceStrong};
  --border: ${s.border};
  --on-accent: ${s.onAccent};
  --accent-soft: ${s.accentSoft};
  --font-body: ${bodyStack};
  --font-display: ${displayStack};
  --font-mono: ${monoStack};
  --text-h1: ${scale.h1};
  --text-h2: ${scale.h2};
  --text-h3: ${scale.h3};
  --text-body: ${scale.body};
  --text-small: ${scale.small};
}
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); font-size: var(--text-body); margin: 0; color-scheme: ${s.scheme}; }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-display); }
h1 { font-size: var(--text-h1); }
h2 { font-size: var(--text-h2); }
h3 { font-size: var(--text-h3); }`;
}


/**
 * The Google Fonts stylesheet URL a theme needs, or '' when every family it
 * uses is a device font.
 *
 * One request for all three roles rather than three, and `display=swap` so
 * text paints in the fallback immediately instead of hanging invisible while
 * the font downloads.
 */
export function webfontHref(theme = {}) {
  const keys = [theme.fontFamily, theme.fontDisplay, theme.fontMono];
  const families = [...new Set(keys.map((k) => FONT_STACKS[k]?.webfont).filter(Boolean))];
  if (families.length === 0) return '';
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
}
