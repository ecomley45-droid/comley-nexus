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

const COLLECTION_TYPES = ['card-grid', 'scrolling-cards', 'list', 'stats', 'testimonials', 'team', 'faq', 'tabs'];

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

  return (
    <div className="pt-1">
      <StringListEditor label="Headings" items={fields.headings || []} onChange={(headings) => setFields({ headings })} placeholder="Heading text" />
      <StringListEditor label="Paragraphs" items={fields.text || []} onChange={(text) => setFields({ text })} multiline placeholder="Paragraph text" />
      <ImagesEditor images={fields.images || []} onChange={(images) => setFields({ images })} />
      <LinksEditor links={fields.links || []} onChange={(links) => setFields({ links })} />
      {COLLECTION_TYPES.includes(section.blockType) && (
        <ItemsEditor items={fields.items || []} onChange={(items) => setFields({ items })} />
      )}
      {section.blockType === 'pricing-table' && (
        <PlansEditor plans={fields.plans || []} onChange={(plans) => setFields({ plans })} />
      )}
      {section.blockType === 'video' && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Video URL (YouTube or Vimeo)</label>
          <GlassInput value={fields.videoUrl || ''} onChange={(e) => setFields({ videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" className="w-full" />
        </div>
      )}
      {section.blockType === 'newsletter' && (
        <div className="mb-3">
          <label className="text-xs text-zinc-400 block mb-1">Button label</label>
          <GlassInput value={fields.buttonLabel || ''} onChange={(e) => setFields({ buttonLabel: e.target.value })} placeholder="Subscribe" className="w-full" />
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
