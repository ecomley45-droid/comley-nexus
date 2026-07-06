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

// Returns the `:root { --color-*: ...; --font-*: ...; --text-*: ...; }` +
// base `body` rule string for a theme object. Falls back field-by-field so
// an org that only ever set the original 4 colors (primary/secondary/bg/text)
// still renders correctly once accent/link/muted/fontFamily/fontScale exist.
export function buildThemeStyleBlock(theme = {}) {
  const t = { ...DEFAULT_THEME, ...theme };
  const fontStack = (FONT_STACKS[t.fontFamily] || FONT_STACKS.system).value;
  const scale = FONT_SCALES[t.fontScale] || FONT_SCALES.comfortable;

  return `:root {
  --color-primary: ${t.primary};
  --color-secondary: ${t.secondary};
  --color-bg: ${t.bg};
  --color-text: ${t.text};
  --color-accent: ${t.accent};
  --color-link: ${t.link};
  --color-muted: ${t.muted};
  --font-body: ${fontStack};
  --text-h1: ${scale.h1};
  --text-h2: ${scale.h2};
  --text-h3: ${scale.h3};
  --text-body: ${scale.body};
  --text-small: ${scale.small};
}
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); font-size: var(--text-body); margin: 0; }
h1 { font-size: var(--text-h1); }
h2 { font-size: var(--text-h2); }
h3 { font-size: var(--text-h3); }`;
}
