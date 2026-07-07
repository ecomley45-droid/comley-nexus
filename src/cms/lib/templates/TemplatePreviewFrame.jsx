// Renders a template page (a list of {blockType, fields} sections) inside an
// isolated iframe, WITH the template's theme applied -- unlike
// BlockPreviewFrame (single block, app dark background), this injects
// buildThemeStyleBlock so every block's var(--color-*) references resolve to
// the template's own palette. That makes the marketplace preview
// byte-identical to what an install actually produces (both go through the
// same renderBlock + buildThemeStyleBlock path).
import { buildThemeStyleBlock } from '../../../shared/theme.js';
import { renderBlock } from '../pasteIn/blockRenderers.js';

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

export default function TemplatePreviewFrame({ sections = [], theme = {}, height = 220, interactive = false }) {
  return (
    <div style={{ height, overflow: 'hidden', position: 'relative' }}>
      <iframe
        srcDoc={wrap(sections, theme)}
        title="Template preview"
        style={{ width: '100%', height: '100%', border: 0, pointerEvents: interactive ? 'auto' : 'none' }}
        tabIndex={-1}
      />
    </div>
  );
}
