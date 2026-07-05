// Client-side glue for the "Add Block +" catalog. The catalog itself is
// database-backed (lib/blockCatalog.js, GET /api/block-catalog) so Super
// Admin can edit the platform-wide entries and workspaces can add their
// own -- this module just fetches it and computes each entry's preview
// `html` client-side via blockRenderers.js, so a renderer change is
// reflected immediately without touching stored data.

import { getBlockCatalog } from '../api.js';
import { renderBlock } from '../pasteIn/blockRenderers.js';

// Fixed display order for the categories we shipped with; any category a
// custom block introduces (workspace or platform) still shows, just after
// these, in whatever order the API returns it.
export const BASE_CATEGORIES = ['Structure', 'Content', 'Social Proof', 'Conversion', 'Media', 'Interactive'];

export async function fetchBlockCatalog() {
  const entries = await getBlockCatalog();
  return entries.map((entry) => ({ ...entry, html: renderBlock(entry.blockType, entry.defaultFields) }));
}

export function categoriesFor(entries) {
  const extra = [...new Set(entries.map((e) => e.category))].filter((c) => !BASE_CATEGORIES.includes(c));
  return [...BASE_CATEGORIES.filter((c) => entries.some((e) => e.category === c)), ...extra];
}

export function buildSectionFromCatalog(entry) {
  return {
    id: `sec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: entry.name,
    blockType: entry.blockType,
    fields: entry.defaultFields,
    html: entry.html,
  };
}
