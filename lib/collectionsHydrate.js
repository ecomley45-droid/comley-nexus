// Serve-time hydration for collection-bound blocks, and resolution of
// collection detail URLs.
//
// Mirrors lib/eventsHydrate.js: a collection-list block is stored as a
// placeholder (renderCollectionList) and gets its real markup here, using the
// same mapper the editor previews through — so preview and published output
// come from one code path rather than two that drift.

import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';
import { applyCollectionToBlock, applyEntryToSections } from '../src/shared/collectionsMap.js';
import * as collections from './collections.js';

const isCollectionBlock = (section) =>
  section?.blockType === 'collection-list' && section?.fields?.collectionSlug;

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
    content: applyEntryToSections(templatePage.content, entry),
    seo: {
      ...(templatePage.seo || {}),
      title: templatePage.seo?.title
        ? String(templatePage.seo.title).replace(/\{\{\s*title\s*\}\}/gi, String(title))
        : String(title),
    },
  };
}
