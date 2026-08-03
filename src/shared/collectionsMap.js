// Turns a collection's entries into the `items` a block already knows how to
// render — the same trick eventsMap.js plays for calendars.
//
// The point is that no new renderer is needed: a collection-list block picks
// a layout, and that layout is an existing block type (card-grid, list,
// blog-cards, team-grid, gallery). The entries are mapped onto the standard
// item shape once, here, and the chosen renderer draws them. So a collection
// automatically inherits every design token, responsive rule and style the
// rest of the system already has.
//
// Shared client/server on purpose: the editor previews through this and the
// server hydrates through this, so what you see is what gets published.

import { guessRole, fillPlaceholders } from './collectionFields.js';

// Layout key -> the block type that actually renders it.
export const COLLECTION_LAYOUTS = {
  cards: { label: 'Cards', blockType: 'card-grid' },
  list: { label: 'List', blockType: 'list' },
  posts: { label: 'Blog posts', blockType: 'blog-cards' },
  people: { label: 'People', blockType: 'team-grid' },
  gallery: { label: 'Gallery', blockType: 'gallery' },
};

export const DEFAULT_LAYOUT = 'cards';

const asDisplay = (value, field) => {
  if (value === null || value === undefined || value === '') return '';
  if (field?.type === 'boolean') return value ? 'Yes' : '';
  if (field?.type === 'date') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  return String(value);
};

/**
 * Map entries onto the standard item shape.
 *
 * `mapping` lets a block override which field fills which slot; anything it
 * doesn't specify is guessed from field names, then types. That's what makes
 * a well-named collection work with zero configuration while an oddly-named
 * one is still fixable without renaming its fields.
 */
export function entriesToItems(collection, entries, { mapping = {}, limit } = {}) {
  const fields = collection?.fields || [];
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const pick = (role) => mapping[role] || guessRole(fields, role);

  const keys = {
    heading: pick('title'),
    body: pick('body'),
    image: pick('image'),
    meta: pick('meta'),
    link: pick('link'),
  };

  const capped = limit && limit > 0 ? entries.slice(0, limit) : entries;
  return capped.map((entry) => {
    const data = entry?.data || {};
    const detailHref = collection?.detailEnabled && collection.detailBase
      ? `/${collection.detailBase}/${entry.slug}`
      : '';
    return {
      heading: asDisplay(data[keys.heading], byKey[keys.heading]),
      meta: asDisplay(data[keys.meta], byKey[keys.meta]),
      body: asDisplay(data[keys.body], byKey[keys.body]),
      image: asDisplay(data[keys.image], byKey[keys.image]),
      // An explicit link field wins; otherwise entries link to their own
      // detail page when the collection has them turned on.
      link: asDisplay(data[keys.link], byKey[keys.link]) || detailHref,
    };
  });
}

/**
 * The fields a collection-list block should render with, given live entries.
 * Returns `{ blockType, fields }` for renderBlock — the block's own headings
 * and text are kept, only `items`/`images` come from the collection.
 */
export function applyCollectionToBlock(blockFields, collection, entries) {
  const layoutKey = COLLECTION_LAYOUTS[blockFields?.layout] ? blockFields.layout : DEFAULT_LAYOUT;
  const layout = COLLECTION_LAYOUTS[layoutKey];
  const items = entriesToItems(collection, entries, {
    mapping: blockFields?.mapping || {},
    limit: Number(blockFields?.limit) || 0,
  });

  const fields = {
    headings: blockFields?.headings || [],
    text: blockFields?.text || [],
    customCss: blockFields?.customCss,
  };

  // A gallery renders `images`, not `items` — same entries, different slot.
  if (layout.blockType === 'gallery') {
    fields.images = items.filter((it) => it.image).map((it) => ({ src: it.image, alt: it.heading || '' }));
  } else {
    fields.items = items;
  }
  return { blockType: layout.blockType, fields };
}

/**
 * Render a detail page's blocks for one entry: every `{{field_key}}` in the
 * block's html is replaced with that entry's value.
 *
 * Operates on the already-rendered html rather than re-running the renderers,
 * so it works for typed blocks and hand-written HTML sections alike.
 */
export function applyEntryToSections(sections, entry) {
  const data = entry?.data || {};
  return (sections || []).map((section) => ({
    ...section,
    html: fillPlaceholders(section.html || '', data),
  }));
}

/** The placeholder tokens available for a collection, for the editor's help text. */
export function placeholdersFor(collection) {
  return (collection?.fields || []).map((f) => ({ token: `{{${f.key}}}`, label: f.label }));
}
