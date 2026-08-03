import { useState, useEffect } from 'react';
import { GlassInput, GlassTextarea, GlassSelect } from '../ui/Glass.jsx';
import { renderBlock, LAYOUT_TEMPLATES } from './blockRenderers.js';
import BlockCatalogPicker from '../blocks/BlockCatalogPicker.jsx';
import { getCalendars, getEvents, getMedia, getCollections, getCollectionEntries } from '../api.js';
import { EVENT_BOUND_TYPES, applyEventsToFields, expandRecurring, accentWrap } from '../../../shared/eventsMap.js';
import { applyCollectionToBlock } from '../../../shared/collectionsMap.js';
import { schemaFor } from './blockFields.js';

// The Content panel for a selected block. Only usable on blocks that carry
// `blockType` + `fields`; hand-authored/raw sections have no structured
// representation and the caller falls back to the HTML view for those.
//
// Which editors appear, in what order, and what they're called all come from
// blockFields.js -- one declaration per block type, matched to what that
// block's renderer actually reads. So a Navigation block offers links and
// nothing else, an FAQ asks for Questions and Answers rather than "Items",
// and a Contact Form finally exposes its button label. Editing always
// regenerates `html` from blockRenderers so the live preview and the
// eventually-saved HTML stay in sync with the typed fields; there's no
// separate "apply" step.

function FieldShell({ label, hint, action, children }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1 gap-2">
        <label className="text-xs text-zinc-400">{label}</label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

const AddButton = ({ onClick, children }) => (
  <button onClick={onClick} className="text-xs text-glass-sky hover:underline shrink-0">{children}</button>
);

function StringListEditor({ spec, items, onChange, multiline = false }) {
  const Field = multiline ? GlassTextarea : GlassInput;
  const max = spec.max || Infinity;
  const update = (i, value) => onChange(items.map((v, idx) => (idx === i ? value : v)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, '']);

  return (
    <FieldShell
      label={spec.label}
      hint={spec.hint}
      action={items.length < max && <AddButton onClick={add}>Add {spec.singular || 'line'}</AddButton>}
    >
      {items.map((v, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5">
          <Field
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={spec.placeholder}
            className="flex-1 min-w-0"
            rows={multiline ? 2 : undefined}
          />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-zinc-600">None yet.</p>}
    </FieldShell>
  );
}

// A small labelled checkbox used for the per-image caption show/hide toggles.
function ToggleChip({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-zinc-400 cursor-pointer select-none">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="accent-glass-indigo" />
      {label}
    </label>
  );
}

// Shared media-library loader: one fetch per mounted editor that needs it.
function useMediaLibrary() {
  const [library, setLibrary] = useState([]);
  useEffect(() => { getMedia().then(setLibrary).catch(() => setLibrary([])); }, []);
  return library;
}

// Each image carries its own metadata (name, alt, description) plus three
// per-placement show flags. The flags decide which pieces render as a
// visible caption on the page when this media sits in a block --
// independently for every placement, so the same asset can show its name
// on one page and its description on another. `alt` is always written to
// the <img alt> attribute for accessibility; `showAlt` only controls
// whether it *also* appears as visible caption text.
function ImagesEditor({ spec, images, onChange }) {
  const library = useMediaLibrary();
  const max = spec.max || Infinity;

  const update = (i, patch) => onChange(images.map((img, idx) => (idx === i ? { ...img, ...patch } : img)));
  const remove = (i) => onChange(images.filter((_, idx) => idx !== i));
  const add = () => onChange([...images, { src: '', alt: '' }]);

  // Picking a library item copies its stored metadata in as defaults; the
  // editor can still override any field afterwards without affecting the
  // library record.
  const pickFromLibrary = (i, mediaId) => {
    const m = library.find((x) => x.id === mediaId);
    if (!m) return;
    update(i, {
      mediaId: m.id, src: m.url,
      name: m.name || '', alt: m.altText || '', description: m.description || '',
    });
  };

  return (
    <FieldShell
      label={spec.label}
      hint={spec.hint}
      action={images.length < max && <AddButton onClick={add}>Add image</AddButton>}
    >
      {images.map((img, i) => (
        <div key={i} className="mb-2 rounded-lg border border-white/10 p-2">
          <div className="flex gap-1.5 mb-1.5">
            {library.length > 0 && (
              <GlassSelect value={img.mediaId || ''} onChange={(e) => pickFromLibrary(i, e.target.value)} className="w-28 shrink-0">
                <option value="">Library…</option>
                {library.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </GlassSelect>
            )}
            <GlassInput value={img.src || ''} onChange={(e) => update(i, { src: e.target.value, mediaId: undefined })} placeholder="Image URL" className="flex-1 min-w-0" />
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-1.5">
            <GlassInput value={img.name || ''} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name / title" />
            <GlassInput value={img.alt || ''} onChange={(e) => update(i, { alt: e.target.value })} placeholder="Alt text" />
          </div>
          <GlassInput value={img.description || ''} onChange={(e) => update(i, { description: e.target.value })} placeholder="Description" className="w-full mb-1.5" />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="text-[11px] text-zinc-600">Show on page:</span>
            <ToggleChip checked={img.showName} onChange={(v) => update(i, { showName: v })} label="Name" />
            <ToggleChip checked={img.showAlt} onChange={(v) => update(i, { showAlt: v })} label="Alt text" />
            <ToggleChip checked={img.showDescription} onChange={(v) => update(i, { showDescription: v })} label="Description" />
          </div>
        </div>
      ))}
      {images.length === 0 && <p className="text-xs text-zinc-600">None yet.</p>}
    </FieldShell>
  );
}

// Single image URL with a library picker — for blocks that carry one image
// as a plain string field (Product) rather than in the `images` array.
function MediaUrlField({ spec, value, onChange }) {
  const library = useMediaLibrary();
  return (
    <FieldShell label={spec.label} hint={spec.hint}>
      <div className="flex gap-1.5">
        {library.length > 0 && (
          <GlassSelect
            value=""
            onChange={(e) => { const m = library.find((x) => x.id === e.target.value); if (m) onChange(m.url); }}
            className="w-28 shrink-0"
          >
            <option value="">Library…</option>
            {library.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </GlassSelect>
        )}
        <GlassInput value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={spec.placeholder || 'https://…'} className="flex-1 min-w-0" />
      </div>
    </FieldShell>
  );
}

function LinksEditor({ spec, links, onChange }) {
  const max = spec.max || Infinity;
  const update = (i, patch) => onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i) => onChange(links.filter((_, idx) => idx !== i));
  const add = () => onChange([...links, { href: '', label: '' }]);

  return (
    <FieldShell
      label={spec.label}
      hint={spec.hint}
      action={links.length < max && <AddButton onClick={add}>Add link</AddButton>}
    >
      {links.map((l, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5">
          <GlassInput value={l.label || ''} onChange={(e) => update(i, { label: e.target.value })} placeholder={spec.labelPlaceholder || 'Label'} className="w-32" />
          <GlassInput value={l.href || ''} onChange={(e) => update(i, { href: e.target.value })} placeholder={spec.hrefPlaceholder || 'https://…'} className="flex-1 min-w-0" />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
        </div>
      ))}
      {links.length === 0 && <p className="text-xs text-zinc-600">None yet.</p>}
    </FieldShell>
  );
}

// Repeating content (cards, people, questions, steps, statistics…). Which
// sub-fields show and what they're called comes from the block's schema, so
// an FAQ asks for a Question and an Answer while a stat asks for a Number
// and a Label — same underlying item shape, block-appropriate wording.
function ItemsEditor({ spec, items, onChange }) {
  const use = spec.use || ['heading', 'meta', 'body', 'image', 'link'];
  const labels = spec.labels || {};
  const placeholders = spec.placeholders || {};
  const max = spec.max || Infinity;
  const singular = spec.singular || 'item';

  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...items, Object.fromEntries(use.map((k) => [k, '']))]);

  // Labelled rather than placeholder-only: once a field has a value the
  // placeholder is gone, and "Dana Whitfield / Founder, Fieldnote" gives no
  // clue which box is the name and which is the role.
  const inputFor = (it, i, key) => {
    const common = {
      value: it[key] || '',
      onChange: (e) => update(i, { [key]: e.target.value }),
      placeholder: placeholders[key] || '',
    };
    return (
      <div key={key} className="mb-1.5">
        <label className="block text-[10px] uppercase tracking-wide text-zinc-600 mb-0.5">{labels[key] || key}</label>
        {key === 'body'
          ? <GlassTextarea {...common} rows={2} className="w-full" />
          : <GlassInput {...common} className="w-full" />}
      </div>
    );
  };

  return (
    <FieldShell
      label={`${spec.label} (${items.length})`}
      hint={spec.hint}
      action={items.length < max && <AddButton onClick={add}>Add {singular}</AddButton>}
    >
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 mb-2">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-500 capitalize">{singular} {i + 1}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-30" title={`Move ${singular} up`}>↑</button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-30" title={`Move ${singular} down`}>↓</button>
              <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
            </div>
          </div>
          {use.map((key) => inputFor(it, i, key))}
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-zinc-600">No {spec.label.toLowerCase()} yet.</p>}
    </FieldShell>
  );
}

function PlansEditor({ spec, plans, onChange }) {
  const update = (i, patch) => onChange(plans.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const remove = (i) => onChange(plans.filter((_, idx) => idx !== i));
  const add = () => onChange([...plans, { name: '', price: '', period: '/mo', features: [], ctaLabel: 'Get started', ctaHref: '#', highlighted: false }]);
  const updateFeature = (i, fi, value) => update(i, { features: plans[i].features.map((f, idx) => (idx === fi ? value : f)) });
  const removeFeature = (i, fi) => update(i, { features: plans[i].features.filter((_, idx) => idx !== fi) });
  const addFeature = (i) => update(i, { features: [...(plans[i].features || []), ''] });

  return (
    <FieldShell label={`${spec.label} (${plans.length})`} hint={spec.hint} action={<AddButton onClick={add}>Add plan</AddButton>}>
      {plans.map((p, i) => (
        <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 mb-2">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-500">Plan {i + 1}</span>
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
          </div>
          <GlassInput value={p.name || ''} onChange={(e) => update(i, { name: e.target.value })} placeholder="Plan name" className="w-full mb-1.5" />
          <div className="flex gap-1.5 mb-1.5">
            <GlassInput value={p.price || ''} onChange={(e) => update(i, { price: e.target.value })} placeholder="$49" className="flex-1 min-w-0" />
            <GlassInput value={p.period || ''} onChange={(e) => update(i, { period: e.target.value })} placeholder="/mo" className="w-20" />
          </div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-zinc-500">Features</span>
            <AddButton onClick={() => addFeature(i)}>Add feature</AddButton>
          </div>
          {(p.features || []).map((f, fi) => (
            <div key={fi} className="flex gap-1.5 mb-1">
              <GlassInput value={f} onChange={(e) => updateFeature(i, fi, e.target.value)} className="flex-1 min-w-0 py-1" />
              <button onClick={() => removeFeature(i, fi)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
            </div>
          ))}
          <div className="flex gap-1.5 mt-1.5">
            <GlassInput value={p.ctaLabel || ''} onChange={(e) => update(i, { ctaLabel: e.target.value })} placeholder="Button label" className="flex-1 min-w-0" />
            <GlassInput value={p.ctaHref || ''} onChange={(e) => update(i, { ctaHref: e.target.value })} placeholder="Button URL" className="flex-1 min-w-0" />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300 mt-2">
            <input type="checkbox" checked={!!p.highlighted} onChange={(e) => update(i, { highlighted: e.target.checked })} className="w-3.5 h-3.5" />
            Highlight this plan
          </label>
        </div>
      ))}
      {plans.length === 0 && <p className="text-xs text-zinc-600">None yet.</p>}
    </FieldShell>
  );
}

// Picks which collection a Collection List block reads from. Lists what the
// workspace actually has rather than asking for a slug, and says so plainly
// when there are none yet.
function CollectionPicker({ spec, value, onChange }) {
  const [collections, setCollections] = useState(null);
  useEffect(() => { getCollections().then((d) => setCollections(d.collections)).catch(() => setCollections([])); }, []);

  return (
    <FieldShell label={spec.label} hint={spec.hint}>
      {collections === null && <p className="text-xs text-zinc-600">Loading…</p>}
      {collections?.length === 0 && (
        <p className="text-xs text-zinc-500">
          No collections yet — create one under <strong className="text-zinc-300">Collections</strong>, then come back.
        </p>
      )}
      {collections?.length > 0 && (
        <GlassSelect value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full">
          <option value="">Choose a collection…</option>
          {collections.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </GlassSelect>
      )}
    </FieldShell>
  );
}

// One block-specific scalar field (button label, video URL, product ID,
// countdown date, feed platform…), rendered from its `kind`.
function ExtraField({ fieldKey, spec, value, onChange }) {
  if (spec.kind === 'collection') {
    return <CollectionPicker spec={spec} value={value} onChange={onChange} />;
  }
  if (spec.kind === 'image') {
    return <MediaUrlField spec={spec} value={value} onChange={onChange} />;
  }
  if (spec.kind === 'select') {
    return (
      <FieldShell label={spec.label} hint={spec.hint}>
        <GlassSelect value={value || spec.options?.[0]?.value || ''} onChange={(e) => onChange(e.target.value)} className="w-full">
          {(spec.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </GlassSelect>
      </FieldShell>
    );
  }
  if (spec.kind === 'number') {
    return (
      <FieldShell label={spec.label} hint={spec.hint}>
        <GlassInput
          type="number"
          min={spec.min}
          max={spec.max}
          value={value ?? ''}
          placeholder={spec.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-full"
        />
      </FieldShell>
    );
  }
  if (spec.kind === 'date') {
    return (
      <FieldShell label={spec.label} hint={spec.hint}>
        <GlassInput
          type="date"
          value={value ? String(value).slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="w-full"
        />
      </FieldShell>
    );
  }
  if (spec.kind === 'month') {
    return (
      <FieldShell label={spec.label} hint={spec.hint}>
        <GlassInput type="month" value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full" />
      </FieldShell>
    );
  }
  return (
    <FieldShell label={spec.label} hint={spec.hint}>
      <GlassInput
        value={value || ''}
        onChange={(e) => onChange(fieldKey === 'productId' ? e.target.value.trim() : e.target.value)}
        placeholder={spec.placeholder}
        className="w-full"
      />
    </FieldShell>
  );
}

// Editor for a Layout block's nested columns. Each column holds zero or
// more full section objects (same shape as top-level blocks), so editing a
// nested child recursively reuses StructuredBlockEditor itself -- a nested
// Hero/CTA/etc. gets full structured editing for free, one level deep only
// (the "Add block" picker below excludes 'layout' so this can't recurse
// further). No Raw HTML toggle at the nested level in v1 -- top-level
// blocks keep it, nested ones don't, a real but minor limitation.
function LayoutBlockEditor({ fields, onChange }) {
  const [expandedChild, setExpandedChild] = useState(null);
  const [addingToColumn, setAddingToColumn] = useState(null);

  const template = LAYOUT_TEMPLATES[fields.template] || LAYOUT_TEMPLATES['two-column'];
  const columns = template.widths.map((_, i) => fields.columns?.[i] || { id: `col-${i}`, sections: [] });

  const commit = (nextColumns) => {
    const nextFields = { ...fields, columns: nextColumns };
    onChange({ fields: nextFields, html: renderBlock('layout', nextFields) });
  };

  // Any nested-child mutation bubbles through here: update the child inside
  // its column, regenerate the child's own html if its fields changed, then
  // regenerate the Layout's own html (via commit) from the updated columns --
  // the one genuinely new piece of logic this feature needed.
  const updateChild = (colIndex, childId, patch) => {
    const nextColumns = columns.map((col, i) => {
      if (i !== colIndex) return col;
      return {
        ...col,
        sections: col.sections.map((child) => {
          if (child.id !== childId) return child;
          const nextChild = { ...child, ...patch };
          if (patch.fields) nextChild.html = renderBlock(nextChild.blockType, nextChild.fields) || nextChild.html;
          return nextChild;
        }),
      };
    });
    commit(nextColumns);
  };

  const removeChild = (colIndex, childId) => {
    commit(columns.map((col, i) => (i !== colIndex ? col : { ...col, sections: col.sections.filter((c) => c.id !== childId) })));
  };

  const moveChildWithinColumn = (colIndex, childId, dir) => {
    const col = columns[colIndex];
    const idx = col.sections.findIndex((c) => c.id === childId);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= col.sections.length) return;
    const nextSections = [...col.sections];
    [nextSections[idx], nextSections[swapWith]] = [nextSections[swapWith], nextSections[idx]];
    commit(columns.map((c, i) => (i !== colIndex ? c : { ...c, sections: nextSections })));
  };

  const moveChildToColumn = (fromCol, childId, toCol) => {
    if (fromCol === toCol) return;
    const child = columns[fromCol].sections.find((c) => c.id === childId);
    if (!child) return;
    commit(columns.map((col, i) => {
      if (i === fromCol) return { ...col, sections: col.sections.filter((c) => c.id !== childId) };
      if (i === toCol) return { ...col, sections: [...col.sections, child] };
      return col;
    }));
  };

  const addChild = (colIndex, newSection) => {
    commit(columns.map((col, i) => (i !== colIndex ? col : { ...col, sections: [...col.sections, newSection] })));
    setAddingToColumn(null);
  };

  return (
    <div className="pt-1">
      <p className="text-xs text-zinc-500 mb-3">
        {template.label} layout -- add blocks into each column below. Columns wrap on narrow screens.
      </p>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col, colIndex) => (
          <div key={col.id || colIndex} className="rounded-lg border border-white/10 bg-white/[0.02] p-2 min-w-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-zinc-400">Column {colIndex + 1}</span>
              <AddButton onClick={() => setAddingToColumn(colIndex)}>Add block</AddButton>
            </div>
            {col.sections.length === 0 && <p className="text-xs text-zinc-600 mb-1">Empty</p>}
            <div className="space-y-1.5">
              {col.sections.map((child, childIdx) => (
                <div key={child.id} className="rounded-md border border-white/10 bg-white/[0.03]">
                  <div className="flex items-center gap-1 p-1.5">
                    <button
                      onClick={() => setExpandedChild(expandedChild === child.id ? null : child.id)}
                      className="flex-1 text-left text-xs text-zinc-200 truncate px-1 min-w-0"
                    >
                      {expandedChild === child.id ? '▾' : '▸'} {child.name}
                    </button>
                    <button onClick={() => moveChildWithinColumn(colIndex, child.id, -1)} disabled={childIdx === 0} className="text-zinc-400 hover:text-zinc-100 disabled:opacity-30 text-xs px-1">↑</button>
                    <button onClick={() => moveChildWithinColumn(colIndex, child.id, 1)} disabled={childIdx === col.sections.length - 1} className="text-zinc-400 hover:text-zinc-100 disabled:opacity-30 text-xs px-1">↓</button>
                    <button onClick={() => removeChild(colIndex, child.id)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                  </div>
                  {columns.length > 1 && (
                    <div className="px-1.5 pb-1.5">
                      <GlassSelect
                        value={colIndex}
                        onChange={(e) => moveChildToColumn(colIndex, child.id, Number(e.target.value))}
                        className="text-[11px] py-0.5 w-full"
                      >
                        {columns.map((_, i) => (
                          <option key={i} value={i}>{i === colIndex ? `Column ${i + 1} (current)` : `Move to column ${i + 1}`}</option>
                        ))}
                      </GlassSelect>
                    </div>
                  )}
                  {expandedChild === child.id && (
                    <div className="border-t border-white/10 p-2">
                      <StructuredBlockEditor section={child} onChange={(patch) => updateChild(colIndex, child.id, patch)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {addingToColumn !== null && (
        <BlockCatalogPicker
          excludeTypes={['layout']}
          onClose={() => setAddingToColumn(null)}
          onInsert={(newSection) => addChild(addingToColumn, newSection)}
        />
      )}
    </div>
  );
}

export default function StructuredBlockEditor({ section, onChange }) {
  // Hooks must run unconditionally, before any early return below.
  const isBound = EVENT_BOUND_TYPES.includes(section.blockType);
  const calId = section.fields?.calendarId;
  const [calendars, setCalendars] = useState([]);
  const [boundEvents, setBoundEvents] = useState([]);

  // Collection binding: the editor renders through the same mapper the server
  // hydrates with, so the canvas shows the real entries rather than the
  // "entries appear here" placeholder.
  const isCollectionBlock = section.blockType === 'collection-list';
  const collectionSlug = section.fields?.collectionSlug;
  const [boundCollection, setBoundCollection] = useState(null);

  useEffect(() => {
    if (!isCollectionBlock || !collectionSlug) { setBoundCollection(null); return; }
    let cancelled = false;
    getCollections()
      .then((d) => {
        const match = (d.collections || []).find((c) => c.slug === collectionSlug);
        if (!match) return null;
        return getCollectionEntries(match.id);
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setBoundCollection({
          collection: loaded.collection,
          entries: (loaded.entries || []).filter((e) => e.status === 'published'),
        });
      })
      .catch(() => { if (!cancelled) setBoundCollection(null); });
    return () => { cancelled = true; };
  }, [isCollectionBlock, collectionSlug]);

  useEffect(() => { if (isBound) getCalendars().then((d) => setCalendars(d.calendars)).catch(() => {}); }, [isBound]);
  useEffect(() => {
    if (isBound && calId) getEvents(calId === 'all' ? undefined : calId).then((d) => setBoundEvents(d.events)).catch(() => setBoundEvents([]));
    else setBoundEvents([]);
  }, [isBound, calId]);

  // Regenerate the block html, applying the bound calendar's events when set
  // (same mapper the server uses at serve time, so preview == published).
  const renderHtml = (f) => {
    if (isCollectionBlock && boundCollection) {
      const { blockType, fields: mapped } = applyCollectionToBlock(f, boundCollection.collection, boundCollection.entries);
      return renderBlock(blockType, mapped) || section.html;
    }
    if (!(isBound && f.calendarId)) return renderBlock(section.blockType, f) || section.html;
    const mapped = applyEventsToFields(section.blockType, f, expandRecurring(boundEvents));
    let html = renderBlock(section.blockType, mapped) || section.html;
    const color = f.calendarId !== 'all' ? calendars.find((c) => c.id === f.calendarId)?.color : null;
    return color ? accentWrap(html, color) : html;
  };

  // Refresh the preview html once bound events / entries have loaded.
  useEffect(() => {
    if (isBound && calId) onChange({ html: renderHtml(section.fields) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundEvents]);
  useEffect(() => {
    if (isCollectionBlock && boundCollection) onChange({ html: renderHtml(section.fields) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundCollection]);

  if (!section.blockType || !section.fields) {
    return (
      <p className="text-xs text-zinc-500 py-3">
        No structured fields for this block — switch to HTML to edit it.
      </p>
    );
  }

  const fields = section.fields;
  const setFields = (patch) => {
    const nextFields = { ...fields, ...patch };
    onChange({ fields: nextFields, html: renderHtml(nextFields) });
  };

  // Layout is a container, not a content block -- headings/images/links
  // don't apply to it either, and it needs its own nested column UI.
  if (section.blockType === 'layout') {
    return <LayoutBlockEditor fields={fields} onChange={onChange} />;
  }

  // Script has no visual layout fields -- it's just a code body, so it skips
  // the generic editors below entirely.
  if (section.blockType === 'script') {
    return (
      <div className="pt-1">
        <label className="text-xs text-zinc-400 block mb-1">JavaScript</label>
        <p className="text-xs text-zinc-600 mb-1.5">
          Runs unsandboxed on the published page inside a &lt;script&gt; tag. Requires workspace admin to save.
        </p>
        <GlassTextarea
          value={fields.code || ''}
          onChange={(e) => setFields({ code: e.target.value })}
          placeholder="console.log('hello');"
          rows={12}
          className="w-full font-mono text-xs"
        />
      </div>
    );
  }

  const schema = schemaFor(section.blockType);
  const boundToCalendar = isBound && !!fields.calendarId;

  // A calendar-bound block's items and images come from the Events page, so
  // hiding those editors is the honest thing to do -- typing into them would
  // be silently overwritten on every render.
  const suppressed = boundToCalendar ? new Set(['items', 'images']) : new Set();

  const renderSection = (key) => {
    if (suppressed.has(key)) return null;
    const spec = schema[key];
    if (spec) {
      // `showWhenPresent` fields exist for legacy/imported shapes a renderer
      // still honors — shown only while they actually hold content, so a
      // freshly added block isn't offered a field that does nothing.
      if (spec.showWhenPresent) {
        const current = fields[key];
        const empty = !current || (Array.isArray(current) ? current.every((v) => !v) : !String(current).trim());
        if (empty) return null;
      }
      switch (key) {
        case 'headings':
          return <StringListEditor key={key} spec={spec} items={fields.headings || []} onChange={(headings) => setFields({ headings })} />;
        case 'text':
          return <StringListEditor key={key} spec={spec} items={fields.text || []} onChange={(text) => setFields({ text })} multiline />;
        case 'images':
          return <ImagesEditor key={key} spec={spec} images={fields.images || []} onChange={(images) => setFields({ images })} />;
        case 'links':
          return <LinksEditor key={key} spec={spec} links={fields.links || []} onChange={(links) => setFields({ links })} />;
        case 'items':
          return <ItemsEditor key={key} spec={spec} items={fields.items || []} onChange={(items) => setFields({ items })} />;
        case 'plans':
          return <PlansEditor key={key} spec={spec} plans={fields.plans || []} onChange={(plans) => setFields({ plans })} />;
        default:
          break;
      }
    }
    const extra = schema.extras?.[key];
    if (extra) {
      return (
        <ExtraField
          key={key}
          fieldKey={key}
          spec={extra}
          value={fields[key]}
          onChange={(value) => setFields({ [key]: value })}
        />
      );
    }
    return null;
  };

  return (
    <div className="pt-1">
      {isBound && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Calendar source</label>
          <GlassSelect value={fields.calendarId || ''} onChange={(e) => setFields({ calendarId: e.target.value })} className="w-full">
            <option value="">Manual — type events below</option>
            <option value="all">All calendars</option>
            {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </GlassSelect>
          {boundToCalendar && (
            <p className="text-[11px] text-zinc-500 mt-1">
              Showing live events from this calendar ({boundEvents.length} found). Add or edit them on the Events page.
            </p>
          )}
        </div>
      )}

      {(schema.order || []).map(renderSection)}

      <div className="mb-1 pt-2 border-t border-white/10">
        <label className="text-xs text-zinc-400 block mb-1 mt-2">Custom CSS</label>
        <p className="text-[11px] text-zinc-500 mb-1.5">
          For anything the Design panel doesn't cover. Plain CSS rules, injected
          above this block's markup — target its built-in classes
          (<code>nx-item</code>, <code>px-feature</code>, etc. — check the HTML
          view to see what's rendered) or your own selectors.
        </p>
        <GlassTextarea
          value={fields.customCss || ''}
          onChange={(e) => setFields({ customCss: e.target.value })}
          rows={4}
          className="w-full font-mono text-xs"
          placeholder=".nx-item { border-radius: 4px; }"
        />
      </div>
    </div>
  );
}
