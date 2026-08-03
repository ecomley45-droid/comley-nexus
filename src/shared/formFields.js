// Field vocabulary for the Contact Form block.
//
// The block used to render a fixed Name / Email / Message form — you could
// change the button label and nothing else, which rules out most of what
// people actually collect (a phone number, a service dropdown, a date, a
// consent checkbox). These types are the closed set the renderer and the
// editor agree on.
//
// POST /api/public/forms was already generic (it stores whatever name/value
// pairs arrive as jsonb), so nothing downstream needed to change — the
// submissions inbox picks up new fields automatically.

export const FORM_FIELD_TYPES = {
  text: { label: 'Text', input: 'text' },
  email: { label: 'Email', input: 'email' },
  tel: { label: 'Phone', input: 'tel' },
  number: { label: 'Number', input: 'number' },
  date: { label: 'Date', input: 'date' },
  textarea: { label: 'Long text', input: null },
  select: { label: 'Dropdown', input: null },
  checkbox: { label: 'Checkbox', input: 'checkbox' },
};

// Field names become form-data keys and land in the submissions jsonb, so
// they're restricted to something safe and stable.
const nameify = (raw) => String(raw || '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/^([0-9])/, 'f$1')
  .slice(0, 40);

// What the block renders when it has no explicit field list: exactly the
// form it always rendered. Existing pages therefore produce byte-identical
// markup until someone edits the fields.
export const DEFAULT_FORM_FIELDS = [
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'message', label: 'Message', type: 'textarea', required: true },
];

export function normalizeFormFields(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set();
  const out = [];
  for (const f of raw.slice(0, 25)) {
    if (!f || typeof f !== 'object') continue;
    const name = nameify(f.name || f.label);
    if (!name || seen.has(name)) continue;
    // Reserved: `_form` carries the form's title and `_hp` is the honeypot.
    // A field colliding with either would either rename the form or make
    // every submission look like spam.
    if (name === '_form' || name === '_hp' || name === 'form' || name === 'hp') continue;
    const type = FORM_FIELD_TYPES[f.type] ? f.type : 'text';
    const field = {
      name,
      label: String(f.label || name).slice(0, 80),
      type,
      required: f.required === true,
    };
    if (f.placeholder) field.placeholder = String(f.placeholder).slice(0, 100);
    if (type === 'select') {
      field.options = (Array.isArray(f.options) ? f.options : [])
        .map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 40);
    }
    seen.add(name);
    out.push(field);
  }
  return out.length ? out : null;
}

/** The fields a form block should render — its own, or the classic three. */
export function formFieldsFor(blockFields) {
  return normalizeFormFields(blockFields?.formFields) || DEFAULT_FORM_FIELDS;
}
