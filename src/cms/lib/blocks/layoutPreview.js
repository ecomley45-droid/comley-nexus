// Catalog thumbnails for the five Layout blocks.
//
// Every other catalog entry previews by rendering its own defaultFields
// through the real renderer, which is exactly right -- the thumbnail is the
// block. A Layout is different: it's an empty container, and its catalog
// entry seeds empty columns (see db/migrations/009_layout_blocks.sql). So
// renderLayout faithfully drew two or three empty columns and the card came
// out blank.
//
// These are generated examples instead: a wireframe showing what that layout
// is *for* -- the column proportions, the gap, and stand-in content shaped
// like the use case in each entry's description (a sidebar beside body copy,
// a full-bleed image against text, a row of three cards). Preview-only;
// inserting a Layout still gives you empty columns to fill.
//
// Column widths and gaps come from LAYOUT_TEMPLATES, the same constant
// renderLayout uses, so a change to a template's proportions shows up here
// without a second edit.

import { LAYOUT_TEMPLATES } from '../pasteIn/blockRenderers.js';

// Sized for the 1440px logical viewport BlockPreviewFrame renders into,
// which is then scaled to roughly a fifth for the card. Everything is
// deliberately chunky -- at that scale a real 16px line would be under 4px
// and read as noise.
//
// `100vh` rather than a fixed height: the frame's logical height depends on
// how wide the card ends up (it renders at 1440px and scales to fit), so
// only the viewport unit fills the thumbnail exactly at every card size
// instead of cropping or leaving a dead strip.
const STYLE = `
  .lp { display: flex; align-items: stretch; box-sizing: border-box; height: 100vh; font-family: system-ui, sans-serif; }
  .lp-col { min-width: 0; display: flex; flex-direction: column; gap: 22px; box-sizing: border-box; }
  .lp-panel { flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 40px; box-sizing: border-box;
    border: 2px solid rgba(255,255,255,0.11); background: rgba(255,255,255,0.045); border-radius: 20px; }
  .lp-flush { flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 48px; box-sizing: border-box;
    background: rgba(255,255,255,0.045); }
  .lp-head { height: 34px; border-radius: 8px; background: rgba(255,255,255,0.62); }
  .lp-line { height: 18px; border-radius: 6px; background: rgba(255,255,255,0.20); }
  .lp-media { flex: 1; border-radius: 16px; min-height: 120px;
    background: linear-gradient(135deg, rgba(99,102,241,0.65), rgba(217,70,239,0.45)); }
  .lp-media.flush { border-radius: 0; }
  .lp-chip { height: 26px; border-radius: 7px; background: rgba(255,255,255,0.16); }
  .lp-chip.on { background: rgba(99,102,241,0.75); }
`;

const line = (width) => `<div class="lp-line" style="width:${width}"></div>`;

// A bordered content card: small media area, heading, two lines of copy.
const card = () => `<div class="lp-panel">
  <div class="lp-media"></div>
  <div class="lp-head" style="width:64%"></div>
  ${line('100%')}${line('82%')}
</div>`;

// Body copy: heading plus several lines, no media.
const copy = (flush = false) => `<div class="${flush ? 'lp-flush' : 'lp-panel'}">
  <div class="lp-head" style="width:58%"></div>
  ${line('100%')}${line('94%')}${line('100%')}${line('70%')}
</div>`;

// Full-bleed image panel.
const media = (flush = false) =>
  `<div class="lp-media${flush ? ' flush' : ''}" style="flex:1"></div>`;

// A narrow sidebar: a stack of short nav-ish chips, first one active.
const sidebar = () => `<div class="lp-panel" style="gap:16px">
  <div class="lp-chip on" style="width:100%"></div>
  <div class="lp-chip" style="width:84%"></div>
  <div class="lp-chip" style="width:92%"></div>
  <div class="lp-chip" style="width:76%"></div>
  <div style="flex:1"></div>
</div>`;

// What goes inside each column, per template. Chosen to match the use case
// each catalog entry's description names.
const CONTENT = {
  'two-column': [card, card],
  'split-screen': [() => media(true), () => copy(true)],
  asymmetrical: [sidebar, copy],
  grid: [card, card, card],
  featured: [media, copy],
};

/**
 * Wireframe example for one Layout template, as a standalone HTML string
 * ready for BlockPreviewFrame. Falls back to the two-column example for an
 * unknown template key so a hand-edited catalog row can't render blank.
 */
export function renderLayoutExample(templateKey) {
  const key = LAYOUT_TEMPLATES[templateKey] ? templateKey : 'two-column';
  const template = LAYOUT_TEMPLATES[key];
  const content = CONTENT[key] || CONTENT['two-column'];
  // Split Screen is edge to edge by definition, so it gets no outer padding
  // and no gap -- that flushness IS what distinguishes it from Two-column.
  const flush = key === 'split-screen';

  const columns = template.widths
    .map((width, i) => {
      const build = content[i] || content[content.length - 1];
      return `<div class="lp-col" style="flex:${width} 1 0">${build()}</div>`;
    })
    .join('');

  return `<style>${STYLE}</style>
<div class="lp" style="gap:${flush ? '0' : template.gap};padding:${flush ? '0' : '44px'}">${columns}</div>`;
}
