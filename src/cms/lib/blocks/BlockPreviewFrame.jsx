// Shared preview renderer for BlockCatalogPicker.jsx and BlocksCatalogPage.jsx.
// Renders a catalog entry's pre-rendered `html` (see catalog.js) inside an
// isolated iframe so the block's own <style> tags can't leak into (or be
// clobbered by) the app's Tailwind styles.
//
// Renders at a fixed 1440px logical width and scales down to fit (see
// ScaledPreviewFrame) so the thumbnail shows the block as it looks on a real
// desktop site, not reflowed into the narrow card width.
import ScaledPreviewFrame from '../ScaledPreviewFrame.jsx';

const WRAPPER = (html) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #070a13; color: #e2e8f0; font-family: system-ui, sans-serif; }
</style>
</head><body>${html || ''}</body></html>`;

export default function BlockPreviewFrame({ html, height = 160, interactive = false }) {
  return <ScaledPreviewFrame srcDoc={WRAPPER(html)} baseWidth={1440} height={height} interactive={interactive} />;
}
