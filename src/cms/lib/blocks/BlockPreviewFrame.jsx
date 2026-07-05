// Shared preview renderer for BlockCatalogPicker.jsx and BlocksCatalogPage.jsx.
// Renders a catalog entry's pre-rendered `html` (see catalog.js) inside an
// isolated iframe so the block's own <style> tags can't leak into (or be
// clobbered by) the app's Tailwind styles -- same isolation the page
// editor's live-preview panel already relies on.
const WRAPPER = (html) => `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #070a13; color: #e2e8f0; font-family: system-ui, sans-serif; }
</style>
</head><body>${html || ''}</body></html>`;

export default function BlockPreviewFrame({ html, height = 160, interactive = false }) {
  return (
    <div style={{ height, overflow: 'hidden', position: 'relative', background: '#070a13' }}>
      <iframe
        srcDoc={WRAPPER(html)}
        title="Block preview"
        style={{ width: '100%', height: '100%', border: 0, pointerEvents: interactive ? 'auto' : 'none' }}
        tabIndex={-1}
      />
    </div>
  );
}
