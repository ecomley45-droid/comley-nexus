// Renders a template page (a list of {blockType, fields} sections) inside an
// isolated iframe WITH the template's theme applied, so var(--color-*)
// references resolve to the template's palette -- making the marketplace
// preview byte-identical to what an install produces.
//
// Rendered at a fixed 1440px logical width and scaled to fit (see
// ScaledPreviewFrame): the preview shows the real desktop layout scaled down,
// not the site reflowed into the preview's narrow width. Pass `autoHeight` to
// show the whole page (detail view); omit it for a fixed-height card crop.
import { buildThemeStyleBlock } from '../../../shared/theme.js';
import { renderBlock } from '../pasteIn/blockRenderers.js';
import ScaledPreviewFrame from '../ScaledPreviewFrame.jsx';

export function renderSectionsHtml(sections = []) {
  return sections.map((s) => renderBlock(s.blockType, s.fields) || '').join('\n');
}

function wrap(sections, theme) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${buildThemeStyleBlock(theme || {})}
body { margin: 0; }
</style>
</head><body>${renderSectionsHtml(sections)}</body></html>`;
}

// `fullHtml`, when provided, is a complete standalone document (a "keep
// original design" / Full-HTML template page) and is previewed verbatim --
// its own CSS intact -- instead of rendering sections through the block
// renderers + theme.
export default function TemplatePreviewFrame({ sections = [], theme = {}, fullHtml = null, height = 220, autoHeight = false, interactive = false }) {
  const srcDoc = fullHtml && fullHtml.trim() ? fullHtml : wrap(sections, theme);
  return (
    <ScaledPreviewFrame
      srcDoc={srcDoc}
      baseWidth={1440}
      height={height}
      autoHeight={autoHeight}
      interactive={interactive}
    />
  );
}
