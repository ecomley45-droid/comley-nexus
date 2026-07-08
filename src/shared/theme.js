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

export const FONT_STACKS = {
  system: { label: 'Clean Sans', value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  serif: { label: 'Serif', value: "Georgia, 'Times New Roman', serif" },
  mono: { label: 'Mono', value: "'Courier New', Courier, monospace" },
  rounded: { label: 'Rounded Sans', value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  classic: { label: 'Classic Serif', value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
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
    // Readable text color to place on top of the accent color.
    onAccent: luminance(accent) > 0.6 ? '#111111' : '#ffffff',
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
  const fontStack = (FONT_STACKS[t.fontFamily] || FONT_STACKS.system).value;
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
  --font-body: ${fontStack};
  --text-h1: ${scale.h1};
  --text-h2: ${scale.h2};
  --text-h3: ${scale.h3};
  --text-body: ${scale.body};
  --text-small: ${scale.small};
}
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); font-size: var(--text-body); margin: 0; color-scheme: ${s.scheme}; }
h1 { font-size: var(--text-h1); }
h2 { font-size: var(--text-h2); }
h3 { font-size: var(--text-h3); }`;
}
