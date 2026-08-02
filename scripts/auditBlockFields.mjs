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

// Slice the file into function bodies, keyed by function name. Null-prototype
// so a callee named `constructor`/`toString` can't resolve to Object.prototype.
const bodies = Object.create(null);
{
  const re = /(?:export )?function ([A-Za-z_$][\w$]*)\s*\(/g;
  const starts = [];
  let m;
  while ((m = re.exec(src))) starts.push({ name: m[1], idx: m.index });
  starts.forEach((s, i) => {
    bodies[s.name] = src.slice(s.idx, i + 1 < starts.length ? starts[i + 1].idx : src.length);
  });
}

// blockType -> renderer function name.
const mapSrc = src.slice(src.indexOf('export const BLOCK_RENDERERS'), src.indexOf('export function renderBlock'));
const entries = [...mapSrc.matchAll(/^\s*'?([\w-]+)'?:\s*([A-Za-z_$][\w$]*),/gm)].map((x) => [x[1], x[2]]);

// Every `fields.x` / `fields?.x` the body reads, plus those of any helper it
// calls or references (renderCollection, itemCard, …), one graph walk deep.
function fieldsRead(fnName, seen = new Set()) {
  if (!fnName || seen.has(fnName) || !bodies[fnName]) return new Set();
  seen.add(fnName);
  const body = bodies[fnName];
  const keys = new Set();
  for (const m of body.matchAll(/fields\??\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1]);
  for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:\(|\))/g)) {
    const callee = m[1];
    if (callee === fnName || !bodies[callee]) continue;
    for (const k of fieldsRead(callee, seen)) keys.add(k);
  }
  return keys;
}

// Fields the editor never surfaces as an editor of their own, by design.
const IGNORED = new Set([
  'customCss',   // its own always-on textarea at the bottom of the panel
  'calendarId',  // the calendar-source picker, shown for event-bound blocks
  'columns',     // layout only — hand-written editor
  'template',    // layout only — hand-written editor
  'code',        // script only — hand-written editor
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
  const read = [...fieldsRead(fnName)].filter((k) => !IGNORED.has(k));
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
