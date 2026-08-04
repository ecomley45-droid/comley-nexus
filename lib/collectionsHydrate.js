// Serve-time hydration for collection-bound blocks, and resolution of
// collection detail URLs.
//
// Mirrors lib/eventsHydrate.js: a collection-list block is stored as a
// placeholder (renderCollectionList) and gets its real markup here, using the
// same mapper the editor previews through — so preview and published output
// come from one code path rather than two that drift.

import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';
import {
  applyCollectionToBlock, applyCollectionToListingBlock, applyEntryToSections,
  LISTING_COLLECTION_BLOCKS,
} from '../src/shared/collectionsMap.js';
import * as collections from './collections.js';
import { localesOf, localizedPath, isMultilingual } from '../src/shared/i18n.js';

const isCollectionBlock = (section) =>
  (section?.blockType === 'collection-list' || LISTING_COLLECTION_BLOCKS.has(section?.blockType))
  && section?.fields?.collectionSlug;

/**
 * Replace every bound collection-list block's html with its rendered entries.
 * Mutates `page.content` in place (same contract as hydrateEventBlocks) and
 * is a cheap no-op for pages with no collection blocks.
 */
export async function hydrateCollectionBlocks(page, orgId) {
  if (!orgId || !Array.isArray(page?.content)) return page;
  const blocks = page.content.filter(isCollectionBlock);
  if (blocks.length === 0) return page;

  // One fetch per distinct collection, however many blocks reference it.
  const slugs = [...new Set(blocks.map((b) => b.fields.collectionSlug))];
  const loaded = new Map();
  for (const slug of slugs) {
    const found = await collections.listForRender(orgId, slug);
    if (found) loaded.set(slug, found);
  }

  for (const section of blocks) {
    const found = loaded.get(section.fields.collectionSlug);
    // A deleted or renamed collection leaves the placeholder in place rather
    // than blanking the section — visible, and obvious what to fix.
    if (!found) continue;
    if (LISTING_COLLECTION_BLOCKS.has(section.blockType)) {
      const fields = applyCollectionToListingBlock(section.fields, found.collection, found.entries);
      section.html = renderBlock(section.blockType, fields) || section.html;
      continue;
    }
    const { blockType, fields } = applyCollectionToBlock(section.fields, found.collection, found.entries);
    section.html = renderBlock(blockType, fields) || section.html;
  }
  return page;
}

/**
 * Resolve a public path against the collections that publish detail pages.
 *
 * Returns `{ collection, entry, templatePage }` when `path` is
 * `<detailBase>/<entrySlug>` for a collection with detail pages enabled and a
 * published entry at that slug — otherwise null, so the caller falls through
 * to normal page routing.
 */
export async function resolveCollectionDetail(path, orgId, pages) {
  if (!orgId || !path) return null;
  const segments = String(path).split('/').filter(Boolean);
  if (segments.length !== 2) return null;
  const [base, entrySlug] = segments;

  const all = await collections.list(orgId);
  const collection = all.find((c) => c.detailEnabled && c.detailBase && c.detailBase === base);
  if (!collection || !collection.detailPageId) return null;

  const entry = await collections.getEntryBySlug(orgId, collection.id, entrySlug);
  if (!entry || entry.status !== 'published') return null;

  const templatePage = (pages || []).find((p) => p.id === collection.detailPageId);
  if (!templatePage) return null;

  return { collection, entry, templatePage };
}

/**
 * Build the page object to render for one entry: the template page with its
 * blocks' `{{field}}` placeholders filled in, and SEO derived from the entry
 * so every detail URL doesn't share one title.
 */
export function buildDetailPage(templatePage, collection, entry) {
  const titleKey = collection.fields[0]?.key;
  const title = entry.data?.[titleKey] || entry.slug;
  return {
    ...templatePage,
    // Keep the template's own id out of analytics/section CSS collisions by
    // giving the rendered page a stable per-entry identity.
    id: `${templatePage.id}--${entry.slug}`,
    name: String(title),
    slug: entry.slug,
    content: applyEntryToSections(templatePage.content, entry, collection),
    seo: {
      ...(templatePage.seo || {}),
      title: templatePage.seo?.title
        ? String(templatePage.seo.title).replace(/\{\{\s*title\s*\}\}/gi, String(title))
        : String(title),
    },
  };
}


/**
 * Fill language-switcher blocks with the site's declared locales, each
 * pointing at the current page's URL in that language.
 *
 * Stored blocks hold no locale list of their own, so adding a language in
 * Design settings updates every switcher on the site at once — the
 * alternative (copying the list into each block) guarantees they drift.
 */
export function hydrateLanguageBlocks(page, globalSettings, pagePath, currentLocale) {
  if (!Array.isArray(page?.content)) return page;
  const blocks = page.content.filter((s) => s?.blockType === 'language-switcher');
  if (blocks.length === 0) return page;

  const locales = isMultilingual(globalSettings) ? localesOf(globalSettings) : [];
  const base = locales[0]?.code;
  for (const section of blocks) {
    const fields = {
      ...section.fields,
      locales: locales.map((l) => ({
        code: l.code,
        label: l.label,
        href: localizedPath(pagePath, l.code, globalSettings),
        current: l.code === (currentLocale || base),
      })),
    };
    section.html = renderBlock('language-switcher', fields) || section.html;
  }
  return page;
}
