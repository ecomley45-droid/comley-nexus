// Turns a hand-written HTML document into TYPED Nexus blocks — every module
// gets a `blockType` + `fields`, so it's editable field-by-field in the
// Content panel rather than as raw markup.
//
// This is the DOM-free counterpart to src/cms/lib/pasteIn/segment.js. That
// one is richer (it can read computed styles to spot horizontal scrollers)
// but needs a browser; this runs during a marketplace install on the server,
// where there is no DOM. Same heuristics where they don't depend on layout:
// semantic tags first, then repeated-sibling detection for collections, then
// content shape.
//
// THE TRADEOFF, stated plainly: a typed block re-renders through Nexus's own
// renderers, so the source document's CSS no longer applies — the content
// survives and becomes fully no-code editable, but it is re-skinned to the
// workspace theme. Callers that need the original pixels keep the source
// document around separately (materializeInstall still writes `fullHtml` to
// the page, so Convert can hand back a pixel-perfect full-code copy).
//
// Nothing is ever dropped: a module that matches no heuristic becomes a
// 'content' (Rich Text) block, which carries headings, paragraphs, images
// and links — the union of what the extractor pulls out.

import { topLevelElements, bodyOf } from './htmlSections.js';

// ---------------------------------------------------------------------------
// Text / attribute helpers. Template markup is well-formed enough that scoped
// regexes beat hand-rolling a parser here — <p> never nests inside <p>, <a>
// never nests inside <a>, and headings never nest at all.
// ---------------------------------------------------------------------------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', times: '×', middot: '·',
};

function decode(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// Visible text of a fragment: script/style bodies removed, tags stripped,
// whitespace collapsed.
export function textOf(html) {
  return decode(
    String(html || '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function attr(tagHtml, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tagHtml || '');
  if (!m) return '';
  return decode(m[2] ?? m[3] ?? m[4] ?? '');
}

const headingsIn = (html) =>
  [...String(html || '').matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => textOf(m[2])).filter(Boolean);

const paragraphsIn = (html) =>
  [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => textOf(m[1])).filter(Boolean);

const imgTagsIn = (html) => [...String(html || '').matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);

const linksIn = (html) =>
  [...String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: attr(m[1], 'href'), label: textOf(m[2]) }))
    .filter((l) => l.href || l.label);

// A relative path like "images/hero.jpg" would resolve against the CMS's own
// origin and 404, so anything that isn't an absolute http(s) or data: URL
// becomes a labelled placeholder. Matches segmentHtml.js's behavior.
const placeholder = (label) =>
  `https://placehold.co/800x480?text=${encodeURIComponent(String(label || 'Image').slice(0, 40) || 'Image')}`;

function usableImage(url, label) {
  const u = String(url || '').trim();
  if (/^data:image\//i.test(u) || /^https?:\/\//i.test(u)) return u;
  return placeholder(label);
}

const imagesIn = (html) =>
  imgTagsIn(html).map((tag) => {
    const alt = attr(tag, 'alt');
    return { src: usableImage(attr(tag, 'src') || attr(tag, 'data-src'), alt), alt };
  });

// ---------------------------------------------------------------------------
// Repetition detection — the signal that rescues div-soup collections.
// ---------------------------------------------------------------------------

const INLINE = new Set(['a', 'span', 'em', 'strong', 'b', 'i', 'small', 'br', 'code']);
const blockChildren = (html) => topLevelElements(html).filter((c) => !INLINE.has(c.tag));

function innerOf(elementHtml) {
  const start = String(elementHtml || '').indexOf('>');
  const end = String(elementHtml || '').lastIndexOf('</');
  if (start === -1 || end === -1 || end < start) return '';
  return elementHtml.slice(start + 1, end);
}

// Depth-limited structural fingerprint: two elements with the same signature
// are "the same kind of thing". Ignores text and attributes so variant cards
// still match each other.
function signature(chunk, depth = 2) {
  if (depth === 0) return chunk.tag;
  const kids = blockChildren(innerOf(chunk.html)).map((c) => signature(c, depth - 1)).join(',');
  return kids ? `${chunk.tag}(${kids})` : chunk.tag;
}

// The largest set of structurally near-identical siblings at ONE level.
function repetitionAt(html) {
  const children = blockChildren(html);
  if (children.length < 2) return { count: 0, group: [], looksLikeCards: false };
  const groups = new Map();
  for (const c of children) {
    const sig = signature(c);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(c);
  }
  let best = [];
  for (const g of groups.values()) if (g.length > best.length) best = g;
  const looksLikeCards = best.length >= 2 &&
    best.every((c) => /<(img|svg|picture)\b/i.test(c.html) || textOf(c.html).length > 20);
  return { count: best.length, group: best, looksLikeCards };
}

// Real markup almost never puts the repeated items directly under the
// section — they sit inside a wrapper, next to the section's own heading
// (`<section><h2>…</h2><div class="grid">…cards…</div></section>`). So when
// this level has no repetition, look inside the children for it. `depth`
// records how far down the winning group was found; the caller trusts a
// direct hit more than a nested one.
function detectRepetition(html, maxDepth = 3, depth = 0) {
  const here = { ...repetitionAt(html), depth };
  if (here.count >= 2 || depth >= maxDepth) return here;
  let best = here;
  for (const child of blockChildren(html)) {
    const found = detectRepetition(innerOf(child.html), maxDepth, depth + 1);
    if (found.count > best.count) best = found;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const COLLECTION_TYPES = new Set(['card-grid', 'list', 'team', 'testimonials']);

// Types whose renderer draws a heading and its items but no free paragraphs.
// Anything in here needs its intro text lifted into a separate block (see
// htmlToTypedBlocks) or that text is silently lost.
const TEXTLESS_COLLECTIONS = new Set([...COLLECTION_TYPES, 'gallery']);

function classify(chunk, index, total) {
  const { tag, html } = chunk;
  const inner = innerOf(html);
  const role = attr(html.slice(0, html.indexOf('>') + 1), 'role').toLowerCase();
  const cls = attr(html.slice(0, html.indexOf('>') + 1), 'class').toLowerCase();
  const text = textOf(html);
  const links = linksIn(html);
  const images = imagesIn(html);
  const headings = headingsIn(html);

  // Semantic tag or ARIA role wins outright.
  if (tag === 'header' || role === 'banner') return 'header';
  if (tag === 'nav' || role === 'navigation') return 'navigation';
  if (tag === 'footer' || role === 'contentinfo') return 'footer';
  if (tag === 'form' || /<form\b/i.test(html)) return 'form';

  // Positional fallback for div-soup header/footer.
  if (index === 0 && (/<(img|svg)\b/i.test(html) || /logo/.test(cls)) && links.length >= 2 && text.length < 400) return 'header';
  if (index === total - 1 && links.length >= 2 && text.length < 800) return 'footer';

  // Repeated siblings = a collection. A group found directly under this
  // element is taken at face value; one found further down needs to look
  // like real content (or be a longer run) before it outvotes the
  // content-shape heuristics below — otherwise a hero's two buttons would
  // read as a list.
  const rep = detectRepetition(inner);
  if (rep.count >= 2 && (rep.depth === 0 || rep.looksLikeCards || rep.count >= 3)) {
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (/testimonial|quote|review/.test(cls)) return 'testimonials';
    if (/team|staff|people|member/.test(cls)) return 'team';
    if (rep.looksLikeCards) return 'card-grid';
    return 'list';
  }

  // Mostly pictures, little prose.
  if (images.length >= 2 && paragraphsIn(html).length <= 1) return 'gallery';

  // A hero: near the top, one strong heading, a call to action.
  if (index <= 1 && headings.length > 0 && headings.length <= 2 && links.length > 0) return 'hero';

  // A standalone call-to-action band lower down the page.
  if (headings.length === 1 && links.length >= 1 && text.length < 300) return 'cta';

  // Everything else keeps its content in a Rich Text block.
  return 'content';
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

function itemsFrom(group) {
  return group.map((item) => {
    const h = headingsIn(item.html);
    const strong = /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(item.html);
    const heading = h[0] || (strong ? textOf(strong[2]) : '');
    const body = paragraphsIn(item.html).join(' ') || (heading ? '' : textOf(item.html)).slice(0, 400);
    const img = imagesIn(item.html)[0];
    const link = linksIn(item.html)[0];
    return {
      heading,
      meta: '',
      body,
      image: img ? img.src : '',
      link: link ? link.href : '',
    };
  }).filter((it) => it.heading || it.body || it.image);
}

function extractFields(chunk, blockType) {
  const { html } = chunk;
  const inner = innerOf(html);
  const fields = {
    headings: headingsIn(html),
    text: paragraphsIn(html),
    images: imagesIn(html),
    links: linksIn(html),
  };

  if (COLLECTION_TYPES.has(blockType)) {
    const group = detectRepetition(inner).group;
    fields.items = itemsFrom(group);
    // headingsIn/paragraphsIn sweep the whole subtree, so a card's own title
    // and copy also land in the section-level headings/text — and the
    // renderer draws both, printing every card title twice. Keep only the
    // text that isn't already inside an item.
    const claimed = new Set();
    for (const item of group) {
      for (const h of headingsIn(item.html)) claimed.add(h);
      for (const p of paragraphsIn(item.html)) claimed.add(p);
    }
    fields.headings = fields.headings.filter((h) => !claimed.has(h));
    fields.text = fields.text.filter((t) => !claimed.has(t));
  }

  // Blocks whose renderer ignores a field shouldn't carry it — an empty
  // editor for something that does nothing is exactly what blockFields.js
  // exists to prevent.
  if (blockType === 'header') {
    // A header is usually a logo image with no heading text; renderHeader
    // only shows a heading, so recover the site name from the logo's alt
    // rather than letting it vanish.
    if (fields.headings.length === 0) {
      const logoAlt = (fields.images.find((im) => im.alt) || {}).alt;
      if (logoAlt) fields.headings = [logoAlt];
    }
    delete fields.text; delete fields.images;
  }
  if (blockType === 'navigation') { delete fields.headings; delete fields.text; delete fields.images; }
  if (blockType === 'footer') { delete fields.headings; delete fields.images; }
  if (blockType === 'gallery') delete fields.links;
  if (blockType === 'form') {
    delete fields.images; delete fields.links;
    fields.buttonLabel = 'Send message';
  }
  if (blockType === 'hero' || blockType === 'cta') delete fields.images;
  if (COLLECTION_TYPES.has(blockType)) { delete fields.images; delete fields.links; }

  // Paragraph-less prose (a lone <div> of text) would otherwise come through
  // with nothing in it.
  if (fields.text && fields.text.length === 0) {
    const stray = textOf(html);
    const headingText = (fields.headings || []).join(' ');
    const rest = stray.replace(headingText, '').trim();
    if (rest.length > 20) fields.text = [rest.slice(0, 2000)];
  }

  return fields;
}

const TYPE_LABELS = {
  header: 'Header', navigation: 'Navigation', footer: 'Footer', hero: 'Hero',
  cta: 'Call to action', 'card-grid': 'Cards', list: 'List', gallery: 'Gallery',
  team: 'Team', testimonials: 'Testimonials', form: 'Contact form', content: 'Rich text',
};

function nameFor(chunk, blockType, fields) {
  const heading = (fields.headings || [])[0];
  if (heading) return heading.slice(0, 48);
  return TYPE_LABELS[blockType] || 'Section';
}

/**
 * Classify a full HTML document into typed blocks.
 *
 * Returns `[{ name, blockType, fields }]` — the payload-section shape
 * validateSitePayload accepts, with no `html`; callers render it through
 * blockRenderers so the markup always matches the current renderers.
 *
 * `max` caps the block count; the tail is folded into one final Rich Text
 * block so no content is lost to the limit.
 */
export function htmlToTypedBlocks(fullHtml, { max = 40 } = {}) {
  const body = bodyOf(fullHtml);
  if (!body.trim()) return [];

  // Descend through single-child wrappers (<div id="root">…) so the split
  // lands on real modules rather than one giant block.
  let scope = body;
  for (let guard = 0; guard < 6; guard += 1) {
    const chunks = blockChildren(scope).filter((c) => !/^(script|style|link|template)$/.test(c.tag));
    if (chunks.length === 1 && /^(div|main|section|article)$/.test(chunks[0].tag)) {
      const nested = blockChildren(innerOf(chunks[0].html));
      if (nested.length > 1) { scope = innerOf(chunks[0].html); continue; }
    }
    break;
  }

  const chunks = blockChildren(scope)
    .filter((c) => !/^(script|style|link|template)$/.test(c.tag))
    .filter((c) => textOf(c.html) || /<(img|svg|picture|video|iframe|input)\b/i.test(c.html));

  const out = [];
  chunks.forEach((chunk, i) => {
    if (out.length > max) return;
    if (out.length === max) {
      const rest = chunks.slice(i).map((c) => c.html).join('\n');
      const fields = extractFields({ tag: 'div', html: `<div>${rest}</div>` }, 'content');
      out.push({ name: 'Remaining content', blockType: 'content', fields });
      return;
    }
    const blockType = classify(chunk, i, chunks.length);
    const fields = extractFields(chunk, blockType);

    // A collection renderer draws its heading and its items, and nothing
    // else -- so a section's intro paragraph ("Here's what we do…") has
    // nowhere to go and would be dropped on the floor. Split it out as its
    // own block ahead of the collection: all the content survives, and both
    // halves stay fully editable.
    if (TEXTLESS_COLLECTIONS.has(blockType) && (fields.text || []).length > 0) {
      out.push({
        name: (fields.headings || [])[0]?.slice(0, 48) || 'Section intro',
        blockType: 'feature',
        fields: { headings: fields.headings || [], text: fields.text },
      });
      delete fields.text;
      delete fields.headings;
    }

    out.push({ name: nameFor(chunk, blockType, fields), blockType, fields });
  });

  return out;
}
