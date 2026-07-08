// Render-and-segment one HTML document into blocks. This is the exact
// pipeline PasteInModal.jsx runs inline (offscreen sandboxed iframe so any
// scripts run and segment.js sees a post-JS DOM, then segmentPage()),
// extracted so the bulk template importer (TemplateImportPage) can batch it
// over a whole folder of files.
//
// The iframe is sandboxed with `allow-scripts` only (no `allow-same-origin`),
// so imported markup can't read this app's cookies/storage or reach the
// parent -- it can only mutate its own throwaway document.
import { segmentPage } from './segment.js';

const titleCase = (s) =>
  String(s || '').split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

function wrapIfFragment(html) {
  return /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

// Returns { sections, warnings } where each section is
// { name, blockType, fields, confidence } ready to drop into a template
// payload page. 'unknown' (no renderer) is folded into a generic Rich Text
// ('content') block so the content survives rather than being dropped.
export async function segmentHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:1280px; height:2000px; opacity:0; pointer-events:none;';
  document.body.appendChild(iframe);
  try {
    await new Promise((resolve, reject) => {
      iframe.addEventListener('load', resolve, { once: true });
      iframe.addEventListener('error', () => reject(new Error('Failed to render HTML')), { once: true });
      iframe.srcdoc = wrapIfFragment(html);
    });
    // Let any on-load scripts finish mutating the DOM before we read it.
    await new Promise((r) => setTimeout(r, 300));

    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Could not access the rendered document (sandbox blocked access).');

    const { blocks, warnings } = segmentPage(doc);
    const sections = blocks.map((b) => {
      const blockType = b.type.name === 'unknown' ? 'content' : b.type.name;
      return { name: titleCase(blockType), blockType, fields: b.fields, confidence: b.confidence };
    });
    return { sections, warnings };
  } finally {
    iframe.remove();
  }
}
