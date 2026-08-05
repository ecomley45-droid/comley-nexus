// Turn plain <img src> into a responsive one, at render time.
//
// Uploads have been transcoded to WebP for a while, which cuts bytes but not
// dimensions: a 3000px photo from a phone camera was still served at 3000px
// into a 390px column. The browser downloads every one of those pixels and
// discards most of them. On a listing page with a dozen photos that is the
// largest single thing on the wire.
//
// Doing this in the renderers was the obvious place and the wrong one. Only
// `images[]` fields carry an image object; a card's `items[].image`, a
// listing's photo and every image inside an imported full-HTML page are bare
// URL strings, and those are exactly the image-heavy pages. Rewriting the
// finished HTML against the media library catches all of them with one
// implementation, and needs no change to eighty-odd renderers.
//
// Only images we host are touched. An external URL is left alone, because we
// have no smaller copy of someone else's file and inventing one would be a
// broken link.

/** url -> { variants, width, height } for every media row that has variants. */
export function buildMediaIndex(rows = []) {
  const index = new Map();
  for (const row of rows) {
    if (!row?.url) continue;
    const variants = (Array.isArray(row.variants) ? row.variants : [])
      .filter((v) => v && v.url && Number(v.w) > 0);
    if (variants.length === 0 && !row.width) continue;
    index.set(row.url, { variants, width: row.width || null, height: row.height || null });
  }
  return index;
}

/**
 * The `sizes` hint: how wide this image will actually be laid out.
 *
 * It has to be supplied, because the browser picks a candidate before it has
 * laid the page out and assumes the full viewport otherwise -- which would
 * hand every phone the widest file and undo the point. These match the
 * grid rules the block CSS actually uses, so they are honest rather than
 * decorative.
 */
const DEFAULT_SIZES = '(min-width: 1100px) 1100px, 100vw';
const GRID_SIZES = '(min-width: 1100px) 360px, (min-width: 700px) 50vw, 100vw';

// Class names that mean "this image sits in a multi-column grid", so it is
// never laid out at anything near full width.
//
// Matched against the markup shortly BEFORE the tag, not the tag itself: the
// block stylesheets put these classes on the wrapper (`<div class="nx-item">
// <img ...>`), so testing the <img> alone never matched and every grid
// thumbnail claimed it needed a full-width file.
const GRID_HINT = /\b(nx-item|lst-shot|lst-card|px-card|px-post|px-team|nx-gallery|lh-shots)\b/;
const LOOKBEHIND = 400;

const ATTR = (name, html) => new RegExp(`\\s${name}\\s*=`, 'i').test(html);

/**
 * Rewrite every <img> whose src we host into a responsive one.
 *
 * Additive and idempotent: an <img> that already declares srcset is left
 * exactly as authored, so a hand-written responsive image in a Script block
 * or an imported document is never second-guessed.
 */
export function applyResponsiveImages(html, index) {
  if (!html || !index || index.size === 0) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag, offset) => {
    if (ATTR('srcset', tag)) return tag;
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!src) return tag;
    const media = index.get(src[1]);
    if (!media) return tag;

    const add = [];
    const candidates = media.variants.map((v) => `${v.url} ${Math.round(v.w)}w`);
    // The original is the largest candidate; without it a wide screen can
    // never reach full resolution.
    if (media.width) candidates.push(`${src[1]} ${Math.round(media.width)}w`);
    if (candidates.length > 1) {
      add.push(`srcset="${candidates.join(', ')}"`);
      const context = html.slice(Math.max(0, offset - LOOKBEHIND), offset) + tag;
      add.push(`sizes="${GRID_HINT.test(context) ? GRID_SIZES : DEFAULT_SIZES}"`);
    }
    // Intrinsic dimensions reserve the box before the bytes arrive, which is
    // what stops the page shifting under the reader. Never override an
    // author's own width/height -- they may be sizing it deliberately.
    if (media.width && media.height && !ATTR('width', tag) && !ATTR('height', tag)) {
      add.push(`width="${Math.round(media.width)}"`, `height="${Math.round(media.height)}"`);
    }
    if (add.length === 0) return tag;
    return tag.replace(/\s*\/?>$/, ` ${add.join(' ')}${tag.trimEnd().endsWith('/>') ? ' />' : '>'}`);
  });
}
