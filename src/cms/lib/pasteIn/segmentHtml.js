// Segment one static HTML document into blocks for the bulk template
// importer. Unlike PasteInModal (which renders pasted markup in a sandboxed
// iframe so runtime scripts can fill the DOM first), imported .html template
// files are static, so we parse them directly with DOMParser: a real,
// same-origin Document we can always read -- no iframe, no sandbox
// cross-origin access issues (an offscreen iframe sandboxed WITHOUT
// allow-same-origin returns a null contentDocument, which is what made an
// earlier version segment every file to nothing).
//
// segment.js is already written to tolerate a view-less document
// (safeComputedStyle() returns null and callers cope), so DOMParser output
// segments the same way a rendered frame would for static markup.
import { segmentPage } from './segment.js';

const titleCase = (s) =>
  String(s || '').split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

// Relative image paths in a template file (e.g. "images/hero.jpg") resolve
// against THIS app's origin once parsed, so they'd 404. Anything that isn't a
// data: URI or an external (different-origin) http(s) URL is swapped for a
// labelled placeholder, so previews and imported templates look clean instead
// of showing broken images. Real external/CDN images are kept as-is.
const placeholder = (label) => `https://placehold.co/800x480?text=${encodeURIComponent(String(label || 'Image').slice(0, 40) || 'Image')}`;

function usableImageUrl(url) {
  const u = String(url || '').trim();
  if (/^data:image\//i.test(u)) return u;
  try {
    const parsed = new URL(u, window.location.href);
    if (/^https?:$/.test(parsed.protocol) && parsed.origin !== window.location.origin) return u;
  } catch { /* not a URL */ }
  return null;
}

function fixImages(fields) {
  const f = { ...fields };
  if (Array.isArray(f.images)) {
    f.images = f.images.map((im) => ({ ...im, src: usableImageUrl(im.src) || placeholder(im.alt) }));
  }
  if (Array.isArray(f.items)) {
    f.items = f.items.map((it) => (it && it.image != null
      ? { ...it, image: usableImageUrl(it.image) || placeholder(it.heading) }
      : it));
  }
  if (f.image != null) f.image = usableImageUrl(f.image) || placeholder(f.headings?.[0]);
  return f;
}

// Returns { sections, warnings } where each section is
// { name, blockType, fields, confidence } ready to drop into a template
// payload page. 'unknown' (no renderer) is folded into a Rich Text
// ('content') block so the content survives rather than being dropped.
// Kept async so callers can `await` it uniformly.
export async function segmentHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const { blocks, warnings } = segmentPage(doc);
  const sections = blocks.map((b) => {
    const blockType = b.type.name === 'unknown' ? 'content' : b.type.name;
    return { name: titleCase(blockType), blockType, fields: fixImages(b.fields), confidence: b.confidence };
  });
  return { sections, warnings };
}
