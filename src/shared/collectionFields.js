// The field vocabulary a collection can be built from, plus validation and
// coercion for entry data.
//
// Shared by the browser (the field designer and the entry editor) and the
// server (which re-validates every write — the client is never the authority
// on shape). Deliberately a small, closed set: each type maps to one input
// in the editor, one coercion here, and one way of rendering into a block,
// so adding a type is three obvious edits rather than an open-ended union.

export const FIELD_TYPES = {
  text: { label: 'Text', help: 'A single line — a title, a name, a location.' },
  textarea: { label: 'Long text', help: 'A paragraph or several.' },
  number: { label: 'Number', help: 'Prices, counts, ratings.' },
  boolean: { label: 'Yes / no', help: 'A checkbox — "featured", "sold out".' },
  date: { label: 'Date', help: 'Sorts and formats as a date.' },
  image: { label: 'Image', help: 'A URL, or pick from the media library.' },
  url: { label: 'Link', help: 'An external or internal URL.' },
  select: { label: 'Choice', help: 'One of a fixed list you define.' },
  tags: { label: 'Tags', help: 'Any number from a list you define — features, amenities, categories.' },
  richtext: { label: 'Rich text', help: 'Formatted body copy for a detail page.' },
};

// The types that carry a list of allowed values the author defines.
export const OPTION_TYPES = new Set(['select', 'tags']);

// Field keys become jsonb keys and `{{placeholders}}`, so they're restricted
// to something safe to interpolate and stable to rename around.
export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

export function slugify(raw, fallback = '') {
  const s = String(raw || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

export function keyify(raw) {
  const s = String(raw || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f$1')
    .slice(0, 40);
  return s;
}

/**
 * Normalize a collection's field definitions. Drops anything malformed
 * rather than throwing, so one bad row can't make a collection unopenable.
 */
export function normalizeFields(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const f of raw.slice(0, 40)) {
    if (!f || typeof f !== 'object') continue;
    const key = keyify(f.key || f.label);
    if (!KEY_RE.test(key) || seen.has(key)) continue;
    const type = FIELD_TYPES[f.type] ? f.type : 'text';
    const field = {
      key,
      label: String(f.label || key).slice(0, 80),
      type,
      required: f.required === true,
    };
    if (f.help) field.help = String(f.help).slice(0, 200);
    if (OPTION_TYPES.has(type)) {
      // Tags carry more values than a dropdown reasonably can — a listing's
      // amenity list runs to dozens — so the cap is per-type.
      const max = type === 'tags' ? 120 : 40;
      field.options = (Array.isArray(f.options) ? f.options : [])
        .map((o) => String(o).slice(0, 60)).filter(Boolean).slice(0, max);
    }
    seen.add(key);
    out.push(field);
  }
  return out;
}

// Which field a block should use when it needs "the title" / "the image" /
// "the body" and the collection's own keys are arbitrary. First match by
// name, then first match by type — so a well-named collection needs no
// mapping, and an oddly-named one still renders something sensible.
export function guessRole(fields, role) {
  const byName = {
    title: ['title', 'name', 'heading', 'headline'],
    body: ['body', 'description', 'summary', 'excerpt', 'content'],
    image: ['image', 'photo', 'cover', 'thumbnail', 'picture'],
    meta: ['meta', 'subtitle', 'category', 'role', 'date', 'author'],
    link: ['link', 'url', 'href', 'website'],
  }[role] || [];
  for (const name of byName) {
    const hit = fields.find((f) => f.key === name);
    if (hit) return hit.key;
  }
  const byType = { title: ['text'], body: ['textarea', 'richtext'], image: ['image'], meta: ['text', 'date', 'select'], link: ['url'] }[role] || [];
  for (const type of byType) {
    const hit = fields.find((f) => f.type === type);
    if (hit) return hit.key;
  }
  return null;
}

const asNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Entry values are free text from an editor and end up escaped into HTML by
// the renderers, so coercion here is about shape (a number field holds a
// number) rather than safety.
function coerce(value, field) {
  switch (field.type) {
    case 'number': return asNumber(value);
    case 'boolean': return value === true || value === 'true';
    case 'date': {
      if (!value) return '';
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    case 'select':
      return (field.options || []).includes(String(value)) ? String(value) : '';
    case 'tags': {
      // Accepts an array from the editor or a comma string from an import,
      // and keeps only values the field actually declares — so a filter UI
      // built from `options` can never miss an entry it should have matched.
      const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
      const allowed = new Set(field.options || []);
      const out = [];
      for (const v of raw) {
        const s = String(v).trim();
        if (allowed.has(s) && !out.includes(s)) out.push(s);
      }
      return out.slice(0, 120);
    }
    case 'textarea':
    case 'richtext':
      return String(value ?? '').slice(0, 20000);
    default:
      return String(value ?? '').slice(0, 2000);
  }
}

/**
 * Coerce an entry's data bag against its collection's fields. Unknown keys
 * are dropped — a renamed or removed field stops appearing rather than
 * lingering invisibly in the row forever.
 */
export function normalizeEntryData(data, fields) {
  const out = {};
  const bag = data && typeof data === 'object' ? data : {};
  for (const field of fields) out[field.key] = coerce(bag[field.key], field);
  return out;
}

/** Which required fields are empty. Empty array means the entry is valid. */
export function missingRequired(data, fields) {
  return fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = data?.[f.key];
      if (f.type === 'boolean') return v !== true;
      if (f.type === 'number') return v === null || v === undefined || v === '';
      if (f.type === 'tags') return !Array.isArray(v) || v.length === 0;
      return !String(v ?? '').trim();
    })
    .map((f) => f.label);
}

/**
 * Fill `{{field_key}}` placeholders from an entry's data. Used by detail
 * pages, whose blocks are authored once with placeholders and rendered per
 * entry. An unknown key resolves to '' rather than being left visible —
 * a published page showing "{{titel}}" is worse than showing nothing.
 */
export function fillPlaceholders(text, data) {
  return String(text ?? '').replace(/\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/gi, (_, key) => {
    const v = data?.[key.toLowerCase()];
    if (v === null || v === undefined || v === false) return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  });
}
