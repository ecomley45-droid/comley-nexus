/**
 * segment.js — Page segmentation + block classification for paste-in import.
 *
 * Pipeline: render-aware parse -> segment -> classify (heuristics) -> extract fields.
 * Deterministic first. The LLM (see api.js's classifyBlock) is only called for
 * blocks classify() marks `unknown` -- see PasteInModal.jsx.
 *
 * IMPORTANT: pass in a *rendered* document (post-JS), not the raw paste.
 * See detectRuntimeInjection() for why. Empty containers that get filled by
 * scripts (e.g. <ul id="pro-features"></ul>) will otherwise segment as empty.
 */

// ---------------------------------------------------------------------------
// 0. Entry point
// ---------------------------------------------------------------------------

/**
 * @param {Document|Element} root - a rendered document or container element.
 * @returns {{ blocks: Array<Block>, warnings: Array<object> }} ordered top-level blocks with type + fields.
 */
export function segmentPage(root) {
  const doc = root.body ? root.body : root;
  const warnings = detectRuntimeInjection(root);

  const regions = findTopLevelRegions(doc);
  const blocks = regions.map((el, i) => {
    const type = classifyBlock(el, i, regions.length);
    return {
      index: i,
      type,
      confidence: type.confidence,
      el,
      fields: extractFields(el, type.name),
    };
  });

  return { blocks, warnings };
}

// ---------------------------------------------------------------------------
// 1. Segment — split into top-level regions
// ---------------------------------------------------------------------------

/**
 * Walks the direct children of the real content wrapper -- no exclusive
 * "semantic landmarks OR div-soup" branch, because real pages mix both
 * (e.g. a semantic <header>/<footer> around a plain <div class="cards">
 * grid). Each top-level child is unwrapped through any single-child
 * pass-through wrapper it's sitting in (same idea as deepestContentWrapper,
 * applied per-child), then kept as its own block -- landmark tags and
 * div-soup blocks alike. <main> still expands into its own children so it
 * doesn't become one giant block.
 */
function findTopLevelRegions(container) {
  const host = deepestContentWrapper(container);
  const children = [...host.children].filter(isBlockLevel);

  return children.flatMap((raw) => {
    const el = deepestContentWrapper(raw);
    return el.tagName.toLowerCase() === 'main'
      ? [...el.children].filter(isBlockLevel)
      : [el];
  });
}

function isBlockLevel(el) {
  if (el.nodeType !== 1) return false;
  const t = el.tagName.toLowerCase();
  if (['script', 'style', 'link', 'meta', 'template', 'noscript'].includes(t)) return false;
  return true;
}

/** Descend through single-child wrappers to find where content actually branches. */
function deepestContentWrapper(container) {
  let node = container;
  while (node.children.length === 1 && isBlockLevel(node.children[0])) {
    node = node.children[0];
  }
  return node;
}

// ---------------------------------------------------------------------------
// 2. Classify — label a block with cheap signals
// ---------------------------------------------------------------------------

function classifyBlock(el, position, total) {
  const tag = el.tagName.toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();
  const style = safeComputedStyle(el);

  // --- Structural: semantic tag / role wins immediately ---
  if (tag === 'header' || role === 'banner') return tagged('header', 0.95);
  if (tag === 'nav' || role === 'navigation') return tagged('navigation', 0.95);
  if (tag === 'footer' || role === 'contentinfo') return tagged('footer', 0.95);

  // --- Positional fallback for div-soup header/footer ---
  if (position === 0 && looksLikeHeader(el)) return tagged('header', 0.6);
  if (position === total - 1 && looksLikeFooter(el)) return tagged('footer', 0.6);

  // --- Repetition-based: cards / carousels / lists ---
  const rep = detectRepetition(el);
  if (rep.count >= 2) {
    if (isHorizontalScroller(el, style)) return tagged('scrolling-cards', 0.85, { items: rep.count });
    if (tag === 'ul' || tag === 'ol') return tagged('list', 0.9, { items: rep.count });
    if (rep.looksLikeCards) return tagged('card-grid', 0.8, { items: rep.count });
    return tagged('list', 0.65, { items: rep.count });
  }

  // --- Content heuristics ---
  if (isHero(el, position)) return tagged('hero', 0.55);

  return tagged('unknown', 0.0); // -> send to LLM fallback
}

function tagged(name, confidence, meta = {}) {
  return { name, confidence, ...meta };
}

// ---------------------------------------------------------------------------
// 2b. Repetition detection — the core signal for grids/lists/carousels
// ---------------------------------------------------------------------------

/**
 * Finds the largest set of structurally near-identical direct children.
 * This is what rescues div-soup: repeated siblings = a collection, regardless
 * of tag names or classes.
 */
function detectRepetition(el) {
  const children = [...el.children].filter(isBlockLevel);
  if (children.length < 2) return { count: 0 };

  // Group children by a shallow structural signature.
  const groups = new Map();
  for (const c of children) {
    const sig = structuralSignature(c);
    (groups.get(sig) || groups.set(sig, []).get(sig)).push(c);
  }

  // Largest group of matching siblings.
  let best = [];
  for (const g of groups.values()) if (g.length > best.length) best = g;

  const looksLikeCards = best.length >= 2 &&
    best.every(c => c.querySelector('img,svg,picture') || textLength(c) > 20);

  return { count: best.length, looksLikeCards, sample: best[0] };
}

/**
 * Depth-limited structural fingerprint: tag skeleton + child count.
 * Two elements with the same signature are "the same kind of thing."
 * Intentionally ignores text/attrs so variant cards still match.
 */
function structuralSignature(el, depth = 2) {
  if (depth === 0 || !el.children.length) return el.tagName.toLowerCase();
  const kids = [...el.children]
    .filter(isBlockLevel)
    .map(c => structuralSignature(c, depth - 1))
    .join(',');
  return `${el.tagName.toLowerCase()}(${kids})`;
}

// ---------------------------------------------------------------------------
// 2c. Small classifiers
// ---------------------------------------------------------------------------

function isHorizontalScroller(el, style) {
  if (style && (style.overflowX === 'auto' || style.overflowX === 'scroll')) return true;
  // An unset scroll-snap-type computes to the literal string "none", which
  // is truthy -- must check against that explicitly, not just presence.
  const snapType = style && style.getPropertyValue('scroll-snap-type');
  if (snapType && snapType !== 'none') return true;
  // flex row of equal-width children is the CSS-framework tell (no computed style needed).
  return el.className && /\b(flex|inline-flex)\b/.test(el.className) &&
    !/\bflex-col\b/.test(el.className) &&
    /\boverflow-x-(auto|scroll)\b/.test(el.className);
}

function looksLikeHeader(el) {
  const hasLogo = el.querySelector('img,svg,[class*="logo"]');
  const links = el.querySelectorAll('a').length;
  return !!hasLogo && links >= 2 && textLength(el) < 400;
}

function looksLikeFooter(el) {
  const links = el.querySelectorAll('a').length;
  const smallText = textLength(el) < 800;
  return links >= 2 && smallText;
}

function isHero(el, position) {
  if (position > 1) return false;
  const h = el.querySelector('h1,h2');
  const cta = el.querySelector('a,button');
  return !!h && !!cta && el.querySelectorAll('h1,h2,h3').length <= 2;
}

// ---------------------------------------------------------------------------
// 3. Extract fields — turn a block into typed, editable slots
// ---------------------------------------------------------------------------

function extractFields(el, typeName) {
  const fields = {
    headings: [...el.querySelectorAll('h1,h2,h3,h4')].map(h => txt(h)).filter(Boolean),
    text: collectParagraphs(el),
    images: [...el.querySelectorAll('img')].map(i => ({ src: i.src || i.getAttribute('src'), alt: i.alt })),
    links: [...el.querySelectorAll('a')].map(a => ({ href: a.getAttribute('href'), label: txt(a) })),
  };

  // Collections: expose each repeated item as its own record so it's editable as a list.
  if (['card-grid', 'scrolling-cards', 'list'].includes(typeName)) {
    const rep = detectRepetition(el);
    fields.items = (rep.sample ? siblingsOf(rep.sample) : []).map(item => ({
      heading: txt(item.querySelector('h1,h2,h3,h4,strong,b')),
      body: collectParagraphs(item).join(' '),
      image: (item.querySelector('img') || {}).src || null,
      link: (item.querySelector('a') || {}).getAttribute?.('href') || null,
    }));
  }
  return fields;
}

function siblingsOf(el) {
  const sig = structuralSignature(el);
  return [...el.parentElement.children].filter(c => isBlockLevel(c) && structuralSignature(c) === sig);
}

function collectParagraphs(el) {
  return [...el.querySelectorAll('p')].map(p => txt(p)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 4. Runtime-injection guard — the trap your own demo demonstrates
// ---------------------------------------------------------------------------

/**
 * Flags containers that are empty in source but referenced by scripts, and
 * detects the presence of scripts that mutate the DOM on load. If this fires
 * and you only parsed static HTML, you WILL miss content. Render first.
 */
function detectRuntimeInjection(root) {
  const warnings = [];
  const html = root.documentElement ? root.documentElement.outerHTML : root.outerHTML;

  const emptyIdContainers = [...root.querySelectorAll('[id]')]
    .filter(el => el.children.length === 0 && txt(el) === '');
  for (const el of emptyIdContainers) {
    if (html.includes(`'${el.id}'`) || html.includes(`"${el.id}"`) || html.includes(`getElementById('${el.id}')`)) {
      warnings.push({ type: 'runtime-injection', id: el.id,
        msg: `#${el.id} is empty but referenced in script — render page before segmenting.` });
    }
  }
  if (/\.innerHTML\s*=|appendChild|createElement|render\w*\(/.test(html) && emptyIdContainers.length) {
    warnings.push({ type: 'dynamic-dom', msg: 'DOM-mutating scripts detected; static parse may be incomplete.' });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

function txt(el) { return el ? el.textContent.trim().replace(/\s+/g, ' ') : ''; }
function textLength(el) { return txt(el).length; }

function safeComputedStyle(el) {
  try { return el.ownerDocument.defaultView.getComputedStyle(el); }
  catch { return null; } // JSDOM / server contexts may lack a view
}
