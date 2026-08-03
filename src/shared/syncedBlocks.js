// Synced blocks — one block, many pages, edited once.
//
// The Section Library already let you save a block and insert it elsewhere,
// but it inserted a COPY: change the library entry afterwards and the twelve
// pages using it carry on showing the old version. Updating a footer CTA
// across a site meant opening twelve pages and pasting the same edit twelve
// times, and missing one was invisible until someone noticed.
//
// A synced section carries `libraryId` instead of owning its markup. Its
// stored `html` is kept as a fallback (so a page still renders if the entry
// is deleted) but the library entry is what actually ships.
//
// compilePageHtml already accepted a `library` argument and never used it —
// this is what it was for.

/**
 * The html a section should render with: the library entry's, if it's
 * synced and the entry still exists; otherwise its own.
 */
export function resolveSectionHtml(section, library) {
  if (!section?.libraryId) return section?.html || '';
  const entry = (library || []).find((l) => l.id === section.libraryId);
  // A deleted library entry falls back to the last html this section held,
  // which is what it was showing anyway — better than a page going blank
  // because someone tidied up the library.
  return entry ? (entry.html || '') : (section.html || '');
}

/** Whether a synced section's library entry has gone missing. */
export function isOrphanedSync(section, library) {
  return !!section?.libraryId && !(library || []).some((l) => l.id === section.libraryId);
}

/** How many sections across all pages point at a given library entry. */
export function countSyncedUses(libraryId, pages) {
  let n = 0;
  for (const page of pages || []) {
    for (const section of page.content || []) {
      if (section.libraryId === libraryId) n += 1;
    }
  }
  return n;
}

/** A map of libraryId -> use count, for the Library page's own listing. */
export function syncUsageMap(pages) {
  const map = {};
  for (const page of pages || []) {
    for (const section of page.content || []) {
      if (!section.libraryId) continue;
      map[section.libraryId] = (map[section.libraryId] || 0) + 1;
    }
  }
  return map;
}
