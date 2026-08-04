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
import { toListing, toListings, facetsOf } from './listingsMap.js';
import { renderBlock } from '../cms/lib/pasteIn/blockRenderers.js';

// Listing blocks bound to a whole collection (a search page, a featured row).
export const LISTING_COLLECTION_BLOCKS = new Set(['listing-cards', 'listing-search']);
// Listing blocks that render one entry, on a collection detail page.
export const LISTING_ENTRY_BLOCKS = new Set([
  'listing-hero', 'listing-facts', 'listing-features',
  'mortgage-calculator', 'price-history', 'nearby-schools',
]);

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
 * The fields a collection-bound listing block renders with.
 *
 * Separate from applyCollectionToBlock because listings don't map onto the
 * generic item shape — a card needs price, beds and status as distinct typed
 * values, not three strings crammed into `meta`.
 */
export function applyCollectionToListingBlock(blockFields, collection, entries) {
  const listings = toListings(collection, entries, {
    mapping: blockFields?.mapping || {},
    limit: Number(blockFields?.limit) || 0,
  });
  return {
    ...blockFields,
    listings,
    // Facets come from the unlimited set, so a "featured 6" block still
    // offers the full filter vocabulary if it ever grows a filter panel.
    facets: facetsOf(toListings(collection, entries, { mapping: blockFields?.mapping || {} })),
  };
}

/**
 * Render a detail page's blocks for one entry.
 *
 * Two mechanisms, because two kinds of block live on a detail page. Ordinary
 * blocks get `{{field_key}}` substituted into their already-rendered html,
 * which works for typed blocks and hand-written HTML alike. Listing blocks
 * are re-rendered from the entry instead: their content is a photo grid, a
 * details table and grouped amenity chips, and none of that survives being
 * expressed as a string substitution.
 */
export function applyEntryToSections(sections, entry, collection) {
  const data = entry?.data || {};
  const listing = collection ? toListing(entry, collection) : null;
  return (sections || []).map((section) => {
    if (listing && LISTING_ENTRY_BLOCKS.has(section.blockType)) {
      const html = renderBlock(section.blockType, { ...(section.fields || {}), listing });
      // A renderer that returns '' (features with nothing ticked) collapses
      // the section rather than leaving the unfilled template behind.
      return { ...section, html: html === '' ? '' : html || section.html };
    }
    return { ...section, html: fillPlaceholders(section.html || '', data) };
  });
}

/** The placeholder tokens available for a collection, for the editor's help text. */
export function placeholdersFor(collection) {
  return (collection?.fields || []).map((f) => ({ token: `{{${f.key}}}`, label: f.label }));
}
