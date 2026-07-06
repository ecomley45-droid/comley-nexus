// Fixed starter presets for the theme wizard and Design Settings' "Presets"
// strip. Each is a complete `theme` object (see src/shared/theme.js for the
// fields and their fallbacks) -- picking one just replaces the working
// theme client-side, still fully editable afterward and not saved until the
// user hits Save. Not a separate "CMS theme" concept, just a starting point.

export const THEME_PRESETS = [
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    theme: {
      primary: '#6366f1', secondary: '#d946ef', bg: '#070a13', text: '#e2e8f0',
      accent: '#6366f1', link: '#a5b4fc', muted: '#a1a1aa',
      fontFamily: 'system', fontScale: 'comfortable',
    },
  },
  {
    id: 'warm-editorial',
    name: 'Warm & Editorial',
    theme: {
      primary: '#b45309', secondary: '#78350f', bg: '#1c1917', text: '#f5f0e8',
      accent: '#d97706', link: '#fbbf24', muted: '#a8a29e',
      fontFamily: 'serif', fontScale: 'comfortable',
    },
  },
  {
    id: 'bold-playful',
    name: 'Bold & Playful',
    theme: {
      primary: '#ec4899', secondary: '#8b5cf6', bg: '#160a1f', text: '#fdf4ff',
      accent: '#f472b6', link: '#e879f9', muted: '#c4b5fd',
      fontFamily: 'rounded', fontScale: 'spacious',
    },
  },
  {
    id: 'classic-professional',
    name: 'Classic Professional',
    theme: {
      primary: '#1e3a5f', secondary: '#b8860b', bg: '#0b1220', text: '#e5e9f0',
      accent: '#c9a227', link: '#93b4d8', muted: '#94a3b8',
      fontFamily: 'classic', fontScale: 'comfortable',
    },
  },
  {
    id: 'clean-mono',
    name: 'Clean Mono',
    theme: {
      primary: '#18181b', secondary: '#3f3f46', bg: '#09090b', text: '#fafafa',
      accent: '#e4e4e7', link: '#a1a1aa', muted: '#71717a',
      fontFamily: 'mono', fontScale: 'compact',
    },
  },
  {
    id: 'soft-pastel',
    name: 'Soft Pastel',
    theme: {
      primary: '#93c5fd', secondary: '#fbcfe8', bg: '#0f172a', text: '#f1f5f9',
      accent: '#7dd3fc', link: '#bae6fd', muted: '#94a3b8',
      fontFamily: 'rounded', fontScale: 'comfortable',
    },
  },
];
