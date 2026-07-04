import { GlassInput, GlassTextarea } from '../ui/Glass.jsx';
import { renderBlock } from './blockRenderers.js';

// Structured-view counterpart to BlockRow's raw HTML textarea. Only usable
// on blocks that carry `blockType` + `fields` (created via "Paste in" --
// see PasteInModal.jsx). Editing here always regenerates `html` from
// blockRenderers so the live preview and the eventually-saved HTML stay in
// sync with the typed fields; there's no separate "apply" step.
//
// Blocks without fields (hand-authored sections, or anything imported as
// plain `unknown` content) have no structured representation to edit --
// callers should fall back to the raw HTML view for those.

const COLLECTION_TYPES = ['card-grid', 'scrolling-cards', 'list'];

function StringListEditor({ label, items, onChange, multiline = false, placeholder }) {
  const Field = multiline ? GlassTextarea : GlassInput;
  const update = (i, value) => onChange(items.map((v, idx) => (idx === i ? value : v)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, '']);

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-zinc-400">{label}</label>
        <button onClick={add} className="text-xs text-glass-sky hover:underline">Add</button>
      </div>
      {items.map((v, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5">
          <Field
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1"
            rows={multiline ? 2 : undefined}
          />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-zinc-600">None</p>}
    </div>
  );
}

function ImagesEditor({ images, onChange }) {
  const update = (i, patch) => onChange(images.map((img, idx) => (idx === i ? { ...img, ...patch } : img)));
  const remove = (i) => onChange(images.filter((_, idx) => idx !== i));
  const add = () => onChange([...images, { src: '', alt: '' }]);

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-zinc-400">Images</label>
        <button onClick={add} className="text-xs text-glass-sky hover:underline">Add</button>
      </div>
      {images.map((img, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5">
          <GlassInput value={img.src || ''} onChange={(e) => update(i, { src: e.target.value })} placeholder="Image URL" className="flex-1" />
          <GlassInput value={img.alt || ''} onChange={(e) => update(i, { alt: e.target.value })} placeholder="Alt text" className="w-32" />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
        </div>
      ))}
      {images.length === 0 && <p className="text-xs text-zinc-600">None</p>}
    </div>
  );
}

function LinksEditor({ links, onChange }) {
  const update = (i, patch) => onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i) => onChange(links.filter((_, idx) => idx !== i));
  const add = () => onChange([...links, { href: '', label: '' }]);

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-zinc-400">Links</label>
        <button onClick={add} className="text-xs text-glass-sky hover:underline">Add</button>
      </div>
      {links.map((l, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5">
          <GlassInput value={l.label || ''} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" className="w-32" />
          <GlassInput value={l.href || ''} onChange={(e) => update(i, { href: e.target.value })} placeholder="https://…" className="flex-1" />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
        </div>
      ))}
      {links.length === 0 && <p className="text-xs text-zinc-600">None</p>}
    </div>
  );
}

function ItemsEditor({ items, onChange }) {
  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { heading: '', body: '', image: '', link: '' }]);

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-zinc-400">Items ({items.length})</label>
        <button onClick={add} className="text-xs text-glass-sky hover:underline">Add item</button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 mb-2">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-500">Item {i + 1}</span>
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
          </div>
          <GlassInput value={it.heading || ''} onChange={(e) => update(i, { heading: e.target.value })} placeholder="Heading" className="w-full mb-1.5" />
          <GlassTextarea value={it.body || ''} onChange={(e) => update(i, { body: e.target.value })} placeholder="Body" rows={2} className="w-full mb-1.5" />
          <div className="flex gap-1.5">
            <GlassInput value={it.image || ''} onChange={(e) => update(i, { image: e.target.value })} placeholder="Image URL" className="flex-1" />
            <GlassInput value={it.link || ''} onChange={(e) => update(i, { link: e.target.value })} placeholder="Link URL" className="flex-1" />
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-zinc-600">None</p>}
    </div>
  );
}

export default function StructuredBlockEditor({ section, onChange }) {
  if (!section.blockType || !section.fields) {
    return (
      <p className="text-xs text-zinc-500 py-3">
        No structured fields for this block — switch to Raw HTML to edit it.
      </p>
    );
  }

  const fields = section.fields;
  const setFields = (patch) => {
    const nextFields = { ...fields, ...patch };
    onChange({ fields: nextFields, html: renderBlock(section.blockType, nextFields) || section.html });
  };

  return (
    <div className="pt-1">
      <StringListEditor label="Headings" items={fields.headings || []} onChange={(headings) => setFields({ headings })} placeholder="Heading text" />
      <StringListEditor label="Paragraphs" items={fields.text || []} onChange={(text) => setFields({ text })} multiline placeholder="Paragraph text" />
      <ImagesEditor images={fields.images || []} onChange={(images) => setFields({ images })} />
      <LinksEditor links={fields.links || []} onChange={(links) => setFields({ links })} />
      {COLLECTION_TYPES.includes(section.blockType) && (
        <ItemsEditor items={fields.items || []} onChange={(items) => setFields({ items })} />
      )}
    </div>
  );
}
