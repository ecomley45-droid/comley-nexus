// Whether the responsive-image columns (migration 037) are present.
//
// media.list/add started selecting and inserting `variants, width, height` the
// moment the responsive-images work shipped. If the code is deployed ahead of
// migration 037 -- which is exactly the failure the storage.js header warns
// about, and the one that turns the whole media library into a 500 -- those
// columns don't exist yet and every media read errors with Postgres 42703
// (undefined_column), not 42P01, so it isn't even caught as a missing-table.
//
// So reads are optimistic and self-correcting: try with the columns; the first
// time that fails for their absence, remember it for that table and fall back
// to the pre-037 shape. Media keeps working with no variants until the
// migration runs; nothing 500s in the gap.
//
// Per table, because `media` and `nexus_media` are migrated independently and
// could be in different states.

export const MEDIA_BASE_COLS =
  'id, name, filename, mime_type, size, url, alt_text, description, uploaded_at';

const VARIANT_COLS = ', variants, width, height';

// table -> false once the columns are known absent. Absent key = assume present.
const missing = new Set();

export function mediaCols(table) {
  return MEDIA_BASE_COLS + (missing.has(table) ? '' : VARIANT_COLS);
}

export function mediaHasVariants(table) {
  return !missing.has(table);
}

export function markVariantsMissing(table) {
  missing.add(table);
}

// A Supabase/PostgREST error that means one of the 037 columns isn't there.
// 42703 is Postgres undefined_column; the message match is a belt for clients
// that don't surface the SQLSTATE.
export function isMissingVariantColumn(error) {
  if (!error) return false;
  if (error.code === '42703') return true;
  const m = String(error.message || '');
  return /\b(variants|width|height)\b/.test(m) && /does not exist|could not find|schema cache/i.test(m);
}

// Test seam only: forget what we've learned so a suite can exercise both paths.
export function _resetMediaColumnState() {
  missing.clear();
}
