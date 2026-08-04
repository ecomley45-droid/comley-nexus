// Keeps src/cms/lib/pasteIn/blockFields.js honest against the renderers.
//
// The Content panel only shows the editors a block's schema declares, so a
// renderer that starts reading a new field would silently become partly
// uneditable in no-code mode. This walks every entry in BLOCK_RENDERERS,
// statically extracts the `fields.*` keys its function body reads (following
// one level of helper calls), and reports:
//
//   MISSING  — the renderer reads it, no editor offers it  (a real gap)
//   UNUSED   — the schema offers an editor the renderer ignores (dead UI)
//
// Run: node scripts/auditBlockFields.mjs
// Exits non-zero if anything is MISSING.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RENDERERS = path.join(root, 'src/cms/lib/pasteIn/blockRenderers.js');

const { BLOCK_FIELDS, GENERIC_SCHEMA, CUSTOM_EDITOR_TYPES } =
  await import(path.join(root, 'src/cms/lib/pasteIn/blockFields.js'));

const src = fs.readFileSync(RENDERERS, 'utf8');

// Renderers no longer all live in one file — the listing set is big enough to
// have its own module, and more will follow. Follow blockRenderers.js's own
// relative imports so a renderer that moves out doesn't silently read as
// "reads no fields", which reports every one of its editors as dead UI and
// hides any genuinely missing one.
const sources = [src];
for (const m of src.matchAll(/^import\s+[^'"]*from\s+'(\.\/[^']+)'/gm)) {
  const file = path.join(path.dirname(RENDERERS), m[1]);
  if (fs.existsSync(file)) sources.push(fs.readFileSync(file, 'utf8'));
}

// Slice the sources into function bodies, keyed by function name.
// Null-prototype so a callee named `constructor`/`toString` can't resolve to
// Object.prototype.
//
// Bodies are kept per file as well as globally. A callee is resolved against
// the file it was called from first, because helper names are short and
// collide: a nav renderer's `toggle()` helper and `classList.toggle(...)` in
// an unrelated block are the same token to a regex, and resolving across
// files made one block report fields that only the other reads.
const bodies = Object.create(null);
const fileOf = Object.create(null);
const byFile = [];
sources.forEach((text, fileIndex) => {
  const local = Object.create(null);
  const re = /(?:export )?function ([A-Za-z_$][\w$]*)\s*\(/g;
  const starts = [];
  let m;
  while ((m = re.exec(text))) starts.push({ name: m[1], idx: m.index });
  starts.forEach((s, i) => {
    const body = text.slice(s.idx, i + 1 < starts.length ? starts[i + 1].idx : text.length);
    local[s.name] = body;
    bodies[s.name] = body;
    fileOf[s.name] = fileOf[s.name] ?? fileIndex;
  });
  byFile[fileIndex] = local;
});

// blockType -> renderer function name.
const mapSrc = src.slice(src.indexOf('export const BLOCK_RENDERERS'), src.indexOf('export function renderBlock'));
const entries = [...mapSrc.matchAll(/^\s*'?([\w-]+)'?:\s*([A-Za-z_$][\w$]*),/gm)].map((x) => [x[1], x[2]]);

// Every `fields.x` / `fields?.x` the body reads, plus those of any helper it
// calls or references (renderCollection, itemCard, …), one graph walk deep.
function fieldsRead(fnName, seen = new Set()) {
  if (!fnName || seen.has(fnName) || !bodies[fnName]) return new Set();
  seen.add(fnName);
  const body = bodies[fnName];
  const home = fileOf[fnName];
  const keys = new Set();
  for (const m of body.matchAll(/fields\??\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1]);
  for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:\(|\))/g)) {
    const callee = m[1];
    // Same file only: a helper is never called across module boundaries here,
    // and a same-named token in another file is a coincidence, not a call.
    if (callee === fnName || !byFile[home]?.[callee]) continue;
    for (const k of fieldsRead(callee, seen)) keys.add(k);
  }
  return keys;
}

// Fields a renderer consumes through a helper rather than by naming
// `fields.x` directly, so the static scan can't see them. Each is a real,
// rendered field with a real editor -- just reached indirectly.
const INDIRECT = {
  form: ['formFields'],            // via formFieldsFor()
  'collection-list': ['mapping'],  // via applyCollectionToBlock() at hydrate
  // Read by applyCollectionToListingBlock() when the server hydrates the
  // bound collection, never by the renderer itself.
  'listing-cards': ['collectionSlug', 'limit', 'mapping'],
  'listing-search': ['collectionSlug', 'mapping'],
};

// Fields the editor never surfaces as an editor of their own, by design.
const IGNORED = new Set([
  'customCss',   // its own always-on textarea at the bottom of the panel
  'calendarId',  // the calendar-source picker, shown for event-bound blocks
  'columns',     // layout only — hand-written editor
  'template',    // layout only — hand-written editor
  'code',        // script only — hand-written editor
  // Filled by the server from the bound collection or the entry being
  // rendered. Offering these as editors would invite someone to type a
  // listing into a block instead of into the collection that owns it.
  'listings',
  'facets',
  'listing',
]);

function offeredBy(blockType) {
  const schema = BLOCK_FIELDS[blockType] || GENERIC_SCHEMA;
  return new Set([...(schema.order || []), ...Object.keys(schema.extras || {})]);
}

let missingTotal = 0;
let unusedTotal = 0;
const lines = [];

for (const [blockType, fnName] of entries) {
  if (CUSTOM_EDITOR_TYPES.includes(blockType)) continue;
  const read = [...new Set([...fieldsRead(fnName), ...(INDIRECT[blockType] || [])])].filter((k) => !IGNORED.has(k));
  const offered = offeredBy(blockType);
  const missing = read.filter((k) => !offered.has(k));
  const unused = [...offered].filter((k) => !read.includes(k));
  if (missing.length) { missingTotal += missing.length; lines.push(`  MISSING  ${blockType.padEnd(22)} ${missing.join(', ')}`); }
  if (unused.length) { unusedTotal += unused.length; lines.push(`  unused   ${blockType.padEnd(22)} ${unused.join(', ')}`); }
}

const covered = entries.filter(([t]) => !CUSTOM_EDITOR_TYPES.includes(t)).length;
const custom = entries.filter(([t]) => CUSTOM_EDITOR_TYPES.includes(t)).map(([t]) => t);

console.log(`Audited ${covered} schema-driven block types (${custom.join(', ')} use hand-written editors).`);
if (lines.length) console.log(lines.join('\n'));
console.log(missingTotal === 0
  ? '\nOK — every field a renderer reads has an editor.'
  : `\nFAIL — ${missingTotal} field(s) a renderer reads have no editor.`);
if (unusedTotal) console.log(`(${unusedTotal} editor(s) offered for fields the renderer ignores — dead UI, worth trimming.)`);

process.exit(missingTotal === 0 ? 0 : 1);
