// Unpublished changes on a live page.
//
// Until now, saving WAS publishing: a page marked published had exactly one
// version, so any edit — a half-finished paragraph, a price you're still
// checking — was live the moment autosave fired thirty seconds later. The
// only way to work safely on a live page was to unpublish it, which takes it
// off the internet while you work.
//
// A published page can now carry a `draft`: the pending version of the
// fields that make up its content. The live fields stay canonical and are
// what the public site renders, so the public path needs no changes at all
// and cannot accidentally serve a draft. Publishing copies the draft over
// the live fields and clears it.
//
// Draft pages have no draft-within-a-draft — they're already unpublished, so
// edits apply directly, exactly as before.

// The fields a draft covers: what a page SAYS. Deliberately not `name`,
// `slug`, `parentId` or `status` — those are organisational (they decide
// where the page sits and whether it exists publicly at all), and holding a
// rename hostage to a content publish would be surprising.
export const DRAFTABLE_FIELDS = ['content', 'fullHtml', 'seo', 'analytics', 'layout', 'editorMode'];

export const isPublished = (page) => page?.status === 'published';

/** Whether this page is holding unpublished changes. */
export function hasPendingChanges(page) {
  return isPublished(page) && !!page?.draft && Object.keys(page.draft).length > 0;
}

/**
 * The version to EDIT and preview: live fields with any draft laid over.
 * For a page with no draft this returns the page itself, unchanged.
 */
export function editableView(page) {
  if (!hasPendingChanges(page)) return page;
  return { ...page, ...page.draft };
}

/**
 * Apply an edit. On a published page the draftable parts go into `draft`
 * and everything else applies immediately; on a draft page it all applies
 * immediately.
 *
 * Returns the patch to merge into the page.
 */
export function applyEdit(page, patch) {
  if (!isPublished(page)) return patch;

  const draftPart = {};
  const livePart = {};
  for (const [key, value] of Object.entries(patch)) {
    if (DRAFTABLE_FIELDS.includes(key)) draftPart[key] = value;
    else livePart[key] = value;
  }
  if (Object.keys(draftPart).length === 0) return livePart;

  return { ...livePart, draft: { ...(page.draft || {}), ...draftPart } };
}

/** Promote the draft to live and clear it. */
export function publishDraft(page) {
  if (!hasPendingChanges(page)) return { status: 'published' };
  return { ...page.draft, status: 'published', draft: undefined };
}

/** Throw the pending changes away, leaving the live version untouched. */
export function discardDraft() {
  return { draft: undefined };
}

/**
 * A short description of what's pending, for the editor's banner. Compares
 * the draft against live so the message names what actually changed rather
 * than saying "there are changes".
 */
export function describePending(page) {
  if (!hasPendingChanges(page)) return '';
  const bits = [];
  const draft = page.draft;
  if (draft.content) {
    const before = (page.content || []).length;
    const after = draft.content.length;
    if (after > before) bits.push(`${after - before} block${after - before === 1 ? '' : 's'} added`);
    else if (after < before) bits.push(`${before - after} block${before - after === 1 ? '' : 's'} removed`);
    else bits.push('block edits');
  }
  if (draft.seo) bits.push('SEO');
  if (draft.layout) bits.push('header/footer');
  if (draft.analytics) bits.push('analytics');
  if (draft.fullHtml !== undefined) bits.push('page HTML');
  return bits.join(' · ');
}
