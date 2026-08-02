// Splits a complete HTML document into the top-level content modules that
// become editable blocks.
//
// Used in two places that must agree:
//   - installing a marketplace template whose pages are stored as one
//     hand-written document (lib/sitePayload.js), so a template never lands
//     as a single locked page;
//   - converting an existing full-code page to no-code (pageModes.js).
//
// Deliberately DOM-free. It runs server-side during install, where there is
// no DOMParser, and using the same scanner in the browser means the preview
// a Super Admin sees at import time is exactly what a workspace gets at
// install time.
//
// This is a *structural* split, not a semantic one: each top-level element
// under <body> becomes one raw-HTML block, byte-for-byte as authored. The
// design is preserved (stylesheets from <head> ride along in a leading
// block) and every module becomes independently selectable, reorderable,
// deletable and stylable in the Design panel -- but the blocks carry no
// typed `fields`, so the Content panel offers the HTML view rather than
// per-field inputs. segment.js is the lossy-but-typed alternative, offered
// alongside this at import time.

// Void elements never have a closing tag, so the depth counter must not wait
// for one.
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Elements whose content is raw text: a "<" inside them is data, not markup,
// so the scanner skips straight to the matching close tag.
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

function sliceBetween(html, openTag, closeTag) {
  const lower = html.toLowerCase();
  const start = lower.indexOf(`<${openTag}`);
  if (start === -1) return null;
  const contentStart = html.indexOf('>', start);
  if (contentStart === -1) return null;
  const end = lower.indexOf(`</${closeTag}`, contentStart);
  return html.slice(contentStart + 1, end === -1 ? html.length : end);
}

/** The inner HTML of <body>, or the whole string when there is no <body>. */
export function bodyOf(html) {
  const inner = sliceBetween(html, 'body', 'body');
  return inner === null ? String(html || '') : inner;
}

/** The inner HTML of <head>, or '' when there is none. */
export function headOf(html) {
  return sliceBetween(html, 'head', 'head') || '';
}

/**
 * Top-level element chunks of an HTML fragment, each `{ tag, html }`, in
 * document order. Text between elements is attached to nothing and dropped —
 * body-level bare text is vanishingly rare in real pages and keeping it would
 * produce blocks with no element to style.
 */
export function topLevelElements(fragment) {
  const html = String(fragment || '');
  const out = [];
  let depth = 0;
  let openTag = null;
  let startIdx = 0;

  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    const [full, slash, rawName, , selfClose] = m;
    const name = rawName.toLowerCase();
    const isClose = slash === '/';
    const isVoid = VOID_TAGS.has(name) || selfClose === '/';

    if (!isClose && RAW_TEXT_TAGS.has(name) && !isVoid) {
      // Jump past the raw-text body so its contents can't be mis-parsed.
      const close = html.toLowerCase().indexOf(`</${name}`, TAG_RE.lastIndex);
      const endOfClose = close === -1 ? html.length : (html.indexOf('>', close) + 1 || html.length);
      if (depth === 0) {
        out.push({ tag: name, html: html.slice(m.index, endOfClose) });
      }
      TAG_RE.lastIndex = endOfClose;
      continue;
    }

    if (isClose) {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && openTag) {
          out.push({ tag: openTag, html: html.slice(startIdx, m.index + full.length) });
          openTag = null;
        }
      }
      continue;
    }

    if (isVoid) {
      if (depth === 0) out.push({ tag: name, html: full });
      continue;
    }

    if (depth === 0) { openTag = name; startIdx = m.index; }
    depth += 1;
  }

  // An unclosed top-level element (malformed source) still yields its content
  // rather than being silently dropped.
  if (depth > 0 && openTag) out.push({ tag: openTag, html: html.slice(startIdx) });
  return out;
}

// Comments and whitespace-only chunks aren't content modules.
const isNoise = (chunk) => !chunk.html.trim() || /^<!--/.test(chunk.html.trim());

const looksStructural = (chunk) =>
  /^(div|main|section|article)$/.test(chunk.tag) && topLevelElements(innerOf(chunk.html)).length > 1;

function innerOf(elementHtml) {
  const start = elementHtml.indexOf('>');
  const end = elementHtml.lastIndexOf('</');
  if (start === -1 || end === -1 || end < start) return '';
  return elementHtml.slice(start + 1, end);
}

// A document wrapped in a single <div id="root"> should split on that
// wrapper's children, not come back as one giant block — descend through
// single-child wrappers until there's something to actually split.
function splitTarget(fragment) {
  let current = fragment;
  for (let guard = 0; guard < 6; guard += 1) {
    const chunks = topLevelElements(current).filter((c) => !isNoise(c) && !RAW_TEXT_TAGS.has(c.tag));
    if (chunks.length === 1 && looksStructural(chunks[0])) { current = innerOf(chunks[0].html); continue; }
    return current;
  }
  return current;
}

const FIRST_HEADING = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i;
const SEMANTIC_NAMES = {
  header: 'Header', footer: 'Footer', nav: 'Navigation', aside: 'Sidebar',
  section: 'Section', main: 'Main content', form: 'Form', table: 'Table',
  ul: 'List', ol: 'List', figure: 'Figure', img: 'Image', video: 'Video',
};

// Prefer the module's own first heading as its name — "Pricing" beats
// "Block 4" in the layers list.
function nameFor(chunk, index) {
  const heading = FIRST_HEADING.exec(chunk.html);
  if (heading) {
    const text = heading[1].replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 48);
  }
  return SEMANTIC_NAMES[chunk.tag] || `Block ${index + 1}`;
}

/** How many modules a single document may become. */
export const MAX_SECTIONS = 40;

/**
 * Split a full HTML document into section objects
 * (`{ id, name, html }`) ready to drop into a page's `content`.
 *
 * `makeId(i)` lets callers control id generation — pageModes stamps them
 * with Date.now(), install stamps them from the install batch — so ids stay
 * unique without this module reaching for a clock it can't use in every
 * environment.
 */
export function splitHtmlIntoSections(fullHtml, { makeId = (i) => `sec-${i}` } = {}) {
  const html = String(fullHtml || '');
  if (!html.trim()) return [];
  const sections = [];

  // Stylesheets from <head> would otherwise be lost, taking the design with
  // them. They ride in a leading block so they stay editable and removable.
  const head = headOf(html);
  const styles = topLevelElements(head)
    .filter((c) => c.tag === 'style' || (c.tag === 'link' && /rel\s*=\s*["']?stylesheet/i.test(c.html)))
    .map((c) => c.html)
    .join('\n');
  if (styles.trim()) sections.push({ id: makeId(sections.length), name: 'Page styles', html: styles });

  const chunks = topLevelElements(splitTarget(bodyOf(html))).filter((c) => !isNoise(c));

  chunks.forEach((chunk, i) => {
    if (sections.length > MAX_SECTIONS) return;
    // Everything past the cap collapses into one final block rather than
    // being dropped — no content is ever lost to the limit.
    if (sections.length === MAX_SECTIONS) {
      sections.push({
        id: makeId(sections.length),
        name: 'Remaining content',
        html: chunks.slice(i).map((rest) => rest.html).join('\n'),
      });
      return;
    }
    sections.push({ id: makeId(sections.length), name: nameFor(chunk, i), html: chunk.html });
  });

  if (sections.length === 0) sections.push({ id: makeId(0), name: 'Imported content', html: bodyOf(html) });
  return sections;
}
