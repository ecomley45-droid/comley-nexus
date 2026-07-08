import { useState, useEffect } from 'react';
import { GlassInput, GlassTextarea, GlassSelect } from '../ui/Glass.jsx';
import { renderBlock, LAYOUT_TEMPLATES } from './blockRenderers.js';
import BlockCatalogPicker from '../blocks/BlockCatalogPicker.jsx';
import { getCalendars, getEvents } from '../api.js';
import { EVENT_BOUND_TYPES, applyEventsToFields, expandRecurring, accentWrap } from '../../../shared/eventsMap.js';

// Structured-view counterpart to BlockRow's raw HTML textarea. Only usable
// on blocks that carry `blockType` + `fields` (created via "Paste in" --
// see PasteInModal.jsx). Editing here always regenerates `html` from
// blockRenderers so the live preview and the eventually-saved HTML stay in
// sync with the typed fields; there's no separate "apply" step.
//
// Blocks without fields (hand-authored sections, or anything imported as
// plain `unknown` content) have no structured representation to edit --
// callers should fall back to the raw HTML view for those.

const COLLECTION_TYPES = ['card-grid', 'scrolling-cards', 'list', 'stats', 'testimonials', 'team', 'faq', 'tabs',
  // Polished block set (item-based)
  'feature-icons', 'steps', 'price-list', 'stat-band', 'quote',
  'checklist', 'feature-rows', 'metric-cards', 'testimonial-grid', 'team-grid', 'faq-accordion', 'blog-cards',
  'parallax', 'events-list', 'calendar', 'testimonial-marquee'];

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
            className="flex-1 min-w-0"
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
          <GlassInput value={img.src || ''} onChange={(e) => update(i, { src: e.target.value })} placeholder="Image URL" className="flex-1 min-w-0" />
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
          <GlassInput value={l.href || ''} onChange={(e) => update(i, { href: e.target.value })} placeholder="https://…" className="flex-1 min-w-0" />
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
  const add = () => onChange([...items, { heading: '', meta: '', body: '', image: '', link: '' }]);

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
          <GlassInput value={it.heading || ''} onChange={(e) => update(i, { heading: e.target.value })} placeholder="Heading (e.g. name, question, tab label)" className="w-full mb-1.5" />
          <GlassInput value={it.meta || ''} onChange={(e) => update(i, { meta: e.target.value })} placeholder="Subtitle (e.g. role/title) -- optional" className="w-full mb-1.5" />
          <GlassTextarea value={it.body || ''} onChange={(e) => update(i, { body: e.target.value })} placeholder="Body" rows={2} className="w-full mb-1.5" />
          <div className="flex gap-1.5">
            <GlassInput value={it.image || ''} onChange={(e) => update(i, { image: e.target.value })} placeholder="Image URL" className="flex-1 min-w-0" />
            <GlassInput value={it.link || ''} onChange={(e) => update(i, { link: e.target.value })} placeholder="Link URL" className="flex-1 min-w-0" />
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-zinc-600">None</p>}
    </div>
  );
}

function PlansEditor({ plans, onChange }) {
  const update = (i, patch) => onChange(plans.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const remove = (i) => onChange(plans.filter((_, idx) => idx !== i));
  const add = () => onChange([...plans, { name: '', price: '', period: '/mo', features: [], ctaLabel: 'Get started', ctaHref: '#', highlighted: false }]);
  const updateFeature = (i, fi, value) => update(i, { features: plans[i].features.map((f, idx) => (idx === fi ? value : f)) });
  const removeFeature = (i, fi) => update(i, { features: plans[i].features.filter((_, idx) => idx !== fi) });
  const addFeature = (i) => update(i, { features: [...(plans[i].features || []), ''] });

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-zinc-400">Plans ({plans.length})</label>
        <button onClick={add} className="text-xs text-glass-sky hover:underline">Add plan</button>
      </div>
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
            <button onClick={() => addFeature(i)} className="text-xs text-glass-sky hover:underline">Add feature</button>
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
      {plans.length === 0 && <p className="text-xs text-zinc-600">None</p>}
    </div>
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
              <button onClick={() => setAddingToColumn(colIndex)} className="text-xs text-glass-sky hover:underline">Add block</button>
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
                    <button onClick={() => moveChildWithinColumn(colIndex, child.id, -1)} disabled={childIdx === 0} className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs px-1">↑</button>
                    <button onClick={() => moveChildWithinColumn(colIndex, child.id, 1)} disabled={childIdx === col.sections.length - 1} className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs px-1">↓</button>
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

  useEffect(() => { if (isBound) getCalendars().then((d) => setCalendars(d.calendars)).catch(() => {}); }, [isBound]);
  useEffect(() => {
    if (isBound && calId) getEvents(calId === 'all' ? undefined : calId).then((d) => setBoundEvents(d.events)).catch(() => setBoundEvents([]));
    else setBoundEvents([]);
  }, [isBound, calId]);

  // Regenerate the block html, applying the bound calendar's events when set
  // (same mapper the server uses at serve time, so preview == published).
  const renderHtml = (f) => {
    if (!(isBound && f.calendarId)) return renderBlock(section.blockType, f) || section.html;
    const mapped = applyEventsToFields(section.blockType, f, expandRecurring(boundEvents));
    let html = renderBlock(section.blockType, mapped) || section.html;
    const color = f.calendarId !== 'all' ? calendars.find((c) => c.id === f.calendarId)?.color : null;
    return color ? accentWrap(html, color) : html;
  };

  // Refresh the preview html once the bound events have loaded/changed.
  useEffect(() => {
    if (isBound && calId) onChange({ html: renderHtml(section.fields) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundEvents]);

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
    onChange({ fields: nextFields, html: renderHtml(nextFields) });
  };

  // Layout is a container, not a content block -- headings/images/links
  // don't apply to it either, and it needs its own nested column UI.
  if (section.blockType === 'layout') {
    return <LayoutBlockEditor fields={fields} onChange={onChange} />;
  }

  // Script has no visual layout fields (headings/images/links etc. don't
  // apply to it) -- it's just a code body, so it skips the generic editors
  // below entirely rather than showing empty, irrelevant sections.
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

  const boundToCalendar = isBound && !!fields.calendarId;
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
      <StringListEditor label="Headings" items={fields.headings || []} onChange={(headings) => setFields({ headings })} placeholder="Heading text" />
      <StringListEditor label="Paragraphs" items={fields.text || []} onChange={(text) => setFields({ text })} multiline placeholder="Paragraph text" />
      {!boundToCalendar && <ImagesEditor images={fields.images || []} onChange={(images) => setFields({ images })} />}
      <LinksEditor links={fields.links || []} onChange={(links) => setFields({ links })} />
      {COLLECTION_TYPES.includes(section.blockType) && !boundToCalendar && (
        <ItemsEditor items={fields.items || []} onChange={(items) => setFields({ items })} />
      )}
      {(section.blockType === 'pricing-table' || section.blockType === 'pricing-cards') && (
        <PlansEditor plans={fields.plans || []} onChange={(plans) => setFields({ plans })} />
      )}
      {(section.blockType === 'video' || section.blockType === 'video-split') && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Video URL (YouTube or Vimeo)</label>
          <GlassInput value={fields.videoUrl || ''} onChange={(e) => setFields({ videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" className="w-full" />
        </div>
      )}
      {section.blockType === 'calendar' && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Month to show (YYYY-MM) — items use a YYYY-MM-DD date in their "meta" field</label>
          <GlassInput type="month" value={fields.month || ''} onChange={(e) => setFields({ month: e.target.value })} className="w-full" />
        </div>
      )}
      {section.blockType === 'video-bg' && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Background video URL (.mp4) — add a poster in Images</label>
          <GlassInput value={fields.videoUrl || ''} onChange={(e) => setFields({ videoUrl: e.target.value })} placeholder="https://…/clip.mp4" className="w-full" />
        </div>
      )}
      {section.blockType === 'newsletter' && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Button label</label>
          <GlassInput value={fields.buttonLabel || ''} onChange={(e) => setFields({ buttonLabel: e.target.value })} placeholder="Subscribe" className="w-full" />
        </div>
      )}
      {section.blockType === 'product' && (
        <div className="mb-3 space-y-2">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Product ID (from Commerce &gt; Products)</label>
            <GlassInput value={fields.productId || ''} onChange={(e) => setFields({ productId: e.target.value.trim() })} placeholder="Paste the product's ID" className="w-full" />
            {!fields.productId && <p className="text-[11px] text-zinc-500 mt-1">Without a Product ID the Buy button shows as inactive.</p>}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <label className="text-xs text-zinc-400 block mb-1">Displayed price</label>
              <GlassInput value={fields.price || ''} onChange={(e) => setFields({ price: e.target.value })} placeholder="$29" className="w-full" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs text-zinc-400 block mb-1">Button label</label>
              <GlassInput value={fields.buttonLabel || ''} onChange={(e) => setFields({ buttonLabel: e.target.value })} placeholder="Buy now" className="w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Image URL</label>
            <GlassInput value={fields.image || ''} onChange={(e) => setFields({ image: e.target.value })} placeholder="https://…" className="w-full" />
          </div>
        </div>
      )}
      {section.blockType === 'countdown' && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Target date</label>
          <GlassInput
            type="date"
            value={fields.targetDate ? fields.targetDate.slice(0, 10) : ''}
            onChange={(e) => setFields({ targetDate: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            className="w-full"
          />
        </div>
      )}
      <div className="mb-1 pt-2 border-t border-white/10">
        <label className="text-xs text-zinc-400 block mb-1 mt-2">Custom CSS</label>
        <p className="text-[11px] text-zinc-500 mb-1.5">
          Plain CSS rules, injected above this block's markup. Target its
          built-in classes (<code>nx-item</code>, <code>nx-link</code>, etc. —
          check Raw HTML to see what's rendered) or your own selectors.
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
