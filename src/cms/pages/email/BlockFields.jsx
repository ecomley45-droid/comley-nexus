import { GlassInput, GlassTextarea, GlassSelect } from '../../lib/ui/Glass.jsx';

// Per-block-type edit form. `block` is the block object; `onChange(patch)`
// merges a shallow patch. Kept deliberately plain — a labelled field per
// editable prop, matching the block model in lib/email/blocks.js.
const Row = ({ label, children }) => (
  <label className="block mb-2">
    <span className="text-xs text-zinc-400 block mb-1">{label}</span>
    {children}
  </label>
);

const ALIGN = ['left', 'center', 'right'];
const SOCIAL_NETWORKS = ['instagram', 'facebook', 'x', 'linkedin', 'tiktok', 'youtube'];

export default function BlockFields({ block, onChange }) {
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  const setNum = (k) => (e) => onChange({ [k]: Number(e.target.value) });

  switch (block.type) {
    case 'heading':
      return (
        <>
          <Row label="Text"><GlassInput className="w-full" value={block.text || ''} onChange={set('text')} /></Row>
          <div className="flex gap-2">
            <Row label="Level"><GlassSelect value={block.level} onChange={setNum('level')}>{[1, 2, 3].map((l) => <option key={l} value={l}>H{l}</option>)}</GlassSelect></Row>
            <Row label="Size"><GlassInput type="number" className="w-20" value={block.fontSize} onChange={setNum('fontSize')} /></Row>
            <Row label="Align"><GlassSelect value={block.align} onChange={set('align')}>{ALIGN.map((a) => <option key={a}>{a}</option>)}</GlassSelect></Row>
          </div>
        </>
      );
    case 'text':
      return (
        <>
          <Row label="Content (HTML allowed)"><GlassTextarea rows={4} className="w-full font-sans text-sm" value={block.html || ''} onChange={set('html')} /></Row>
          <Row label="Align"><GlassSelect value={block.align} onChange={set('align')}>{ALIGN.map((a) => <option key={a}>{a}</option>)}</GlassSelect></Row>
        </>
      );
    case 'button':
      return (
        <>
          <Row label="Label"><GlassInput className="w-full" value={block.label || ''} onChange={set('label')} /></Row>
          <Row label="Link"><GlassInput className="w-full" value={block.href || ''} onChange={set('href')} placeholder="https://" /></Row>
          <div className="flex gap-2">
            <Row label="Background"><GlassInput type="color" className="h-9 w-14 p-1" value={block.backgroundColor || '#2563eb'} onChange={set('backgroundColor')} /></Row>
            <Row label="Text color"><GlassInput type="color" className="h-9 w-14 p-1" value={block.color || '#ffffff'} onChange={set('color')} /></Row>
            <Row label="Align"><GlassSelect value={block.align} onChange={set('align')}>{ALIGN.map((a) => <option key={a}>{a}</option>)}</GlassSelect></Row>
          </div>
        </>
      );
    case 'image':
      return (
        <>
          <Row label="Image URL"><GlassInput className="w-full" value={block.src || ''} onChange={set('src')} /></Row>
          <Row label="Alt text"><GlassInput className="w-full" value={block.alt || ''} onChange={set('alt')} /></Row>
          <Row label="Link (optional)"><GlassInput className="w-full" value={block.href || ''} onChange={set('href')} placeholder="https://" /></Row>
          <Row label="Width (px)"><GlassInput type="number" className="w-28" value={block.width || ''} onChange={setNum('width')} /></Row>
        </>
      );
    case 'divider':
      return (
        <div className="flex gap-2">
          <Row label="Color"><GlassInput type="color" className="h-9 w-14 p-1" value={block.color || '#e5e7eb'} onChange={set('color')} /></Row>
          <Row label="Thickness"><GlassInput type="number" className="w-20" value={block.thickness} onChange={setNum('thickness')} /></Row>
        </div>
      );
    case 'spacer':
      return <Row label="Height (px)"><GlassInput type="number" className="w-28" value={block.height} onChange={setNum('height')} /></Row>;
    case 'social':
      return (
        <div>
          <span className="text-xs text-zinc-400 block mb-1">Networks</span>
          {(block.items || []).map((it, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <GlassSelect value={it.network} onChange={(e) => onChange({ items: block.items.map((x, j) => j === i ? { ...x, network: e.target.value } : x) })}>
                {SOCIAL_NETWORKS.map((n) => <option key={n}>{n}</option>)}
              </GlassSelect>
              <GlassInput className="flex-1" placeholder="https://" value={it.href} onChange={(e) => onChange({ items: block.items.map((x, j) => j === i ? { ...x, href: e.target.value } : x) })} />
              <button className="text-zinc-500 hover:text-red-300 px-2" onClick={() => onChange({ items: block.items.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="text-xs text-glass-sky hover:underline" onClick={() => onChange({ items: [...(block.items || []), { network: 'instagram', href: 'https://' }] })}>+ network</button>
        </div>
      );
    case 'menu':
      return (
        <div>
          <span className="text-xs text-zinc-400 block mb-1">Links</span>
          {(block.links || []).map((l, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <GlassInput className="w-28" placeholder="Label" value={l.label} onChange={(e) => onChange({ links: block.links.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
              <GlassInput className="flex-1" placeholder="https://" value={l.href} onChange={(e) => onChange({ links: block.links.map((x, j) => j === i ? { ...x, href: e.target.value } : x) })} />
              <button className="text-zinc-500 hover:text-red-300 px-2" onClick={() => onChange({ links: block.links.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="text-xs text-glass-sky hover:underline" onClick={() => onChange({ links: [...(block.links || []), { label: 'Link', href: 'https://' }] })}>+ link</button>
        </div>
      );
    case 'video':
      return (
        <>
          <Row label="Thumbnail URL"><GlassInput className="w-full" value={block.thumbnail || ''} onChange={set('thumbnail')} /></Row>
          <Row label="Video link"><GlassInput className="w-full" value={block.href || ''} onChange={set('href')} placeholder="https://" /></Row>
        </>
      );
    case 'timer':
      return (
        <>
          <Row label="Label"><GlassInput className="w-full" value={block.label || ''} onChange={set('label')} /></Row>
          <Row label="Target date"><GlassInput type="datetime-local" value={block.targetDate || ''} onChange={set('targetDate')} /></Row>
          <p className="text-xs text-zinc-600">Shows a styled date. Live-ticking countdowns need a countdown-image service (follow-up).</p>
        </>
      );
    case 'html':
      return <Row label="Custom HTML (sanitized)"><GlassTextarea rows={5} className="w-full" value={block.html || ''} onChange={set('html')} /></Row>;
    default:
      return <p className="text-xs text-zinc-500">No editable fields.</p>;
  }
}
