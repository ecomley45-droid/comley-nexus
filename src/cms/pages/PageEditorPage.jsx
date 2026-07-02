import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePagesStore } from '../lib/usePagesStore.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { compilePageHtml, getFullPath } from '../../shared/compilePage.js';
import { getLibrary, getAbStats, getComments, addComment, resolveComment } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect } from '../lib/ui/Glass.jsx';

const newSection = () => ({ id: 'sec-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), name: 'New section', html: '<div class="p-8">New section</div>' });

const DEVICE_WIDTHS = { 'Desktop - Large': 1440, 'Tablet': 768, 'Mobile': 390 };

function AbVariantsEditor({ section, onChange }) {
  const [stats, setStats] = useState({});
  const variants = section.abVariants || [];

  useEffect(() => {
    getAbStats(section.id).then(setStats).catch(() => {});
  }, [section.id]);

  const update = (next) => onChange({ ...section, abVariants: next });

  const addVariant = () => {
    const id = 'variant-' + Date.now();
    update([...variants, { id, name: `Variant ${variants.length + 1}`, html: section.html, weight: 1 }]);
  };

  const updateVariant = (id, patch) => update(variants.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const removeVariant = (id) => update(variants.filter((v) => v.id !== id));

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-zinc-400">A/B variants</span>
        <button onClick={addVariant} className="text-xs text-glass-sky hover:underline">Add variant</button>
      </div>
      {variants.map((v) => (
        <GlassPanel key={v.id} className="p-2 mb-2">
          <div className="flex gap-2 items-center mb-1">
            <GlassInput value={v.name} onChange={(e) => updateVariant(v.id, { name: e.target.value })} className="flex-1 py-1" />
            <GlassInput type="number" min="1" value={v.weight} onChange={(e) => updateVariant(v.id, { weight: Number(e.target.value) })} className="w-16 py-1" title="Weight" />
            <GlassButton variant="danger" onClick={() => removeVariant(v.id)}>Remove</GlassButton>
          </div>
          <GlassTextarea value={v.html} onChange={(e) => updateVariant(v.id, { html: e.target.value })} rows={3} className="w-full" />
          <p className="text-xs text-zinc-500 mt-1">
            Impressions: {stats[v.id]?.impressions ?? 0} · Clicks: {stats[v.id]?.clicks ?? 0}
          </p>
        </GlassPanel>
      ))}
    </div>
  );
}

function CommentsPanel({ pageId, sectionId }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');

  const load = () => getComments(pageId).then((all) => setComments(all.filter((c) => c.sectionId === sectionId)));
  useEffect(() => { load(); }, [pageId, sectionId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await addComment(pageId, sectionId, text);
    setText('');
    load();
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <span className="text-xs font-medium text-zinc-400">Comments</span>
      {comments.map((c) => (
        <div key={c.id} className={`text-xs rounded-lg p-2 mt-1 bg-white/5 border border-white/10 ${c.resolved ? 'opacity-50' : ''}`}>
          <p>{c.text}</p>
          <div className="flex justify-between text-zinc-500 mt-1">
            <span>{c.author}</span>
            <button onClick={async () => { await resolveComment(c.id, !c.resolved); load(); }} className="hover:underline text-glass-sky">
              {c.resolved ? 'Reopen' : 'Resolve'}
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={submit} className="flex gap-2 mt-2">
        <GlassInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" className="flex-1 py-1 text-xs" />
        <button type="submit" className="text-xs text-glass-sky hover:underline">Add</button>
      </form>
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassPanel className="p-4">
      <button onClick={() => setOpen(!open)} className="flex justify-between items-center w-full text-left">
        <h2 className="font-medium text-zinc-200">{title}</h2>
        <span className="text-zinc-500 text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </GlassPanel>
  );
}

// One row in the left block list. Drag-and-drop reorder uses native HTML5
// DnD (draggable + onDragStart/onDragOver/onDrop) — no DnD library needed
// for a flat list.
function BlockRow({ section, index, total, expanded, onToggle, onDragStart, onDragOver, onDrop, onRename, onMove, onDuplicate, onRemove, onChange, pageId }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
    >
      <GlassPanel className="p-3 mb-2 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-5 text-center shrink-0">{index + 1}</span>
          <button onClick={onToggle} className="flex-1 text-left">
            <input
              value={section.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRename(e.target.value)}
              className="font-medium text-sm bg-transparent border-b border-transparent hover:border-white/20 outline-none w-full"
            />
          </button>
          <div className="flex gap-1.5 text-xs text-zinc-400 shrink-0">
            <button onClick={() => onMove(-1)} disabled={index === 0} className="hover:text-white disabled:opacity-30">↑</button>
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="hover:text-white disabled:opacity-30">↓</button>
            <button onClick={onDuplicate} className="hover:text-white">⧉</button>
            <button onClick={onRemove} className="text-red-400 hover:text-red-300">✕</button>
          </div>
        </div>
        {expanded && (
          <div className="mt-3">
            <GlassTextarea value={section.html} onChange={(e) => onChange({ html: e.target.value })} rows={6} className="w-full" />
            <AbVariantsEditor section={section} onChange={onChange} />
            <CommentsPanel pageId={pageId} sectionId={section.id} />
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

export default function PageEditorPage() {
  const { id } = useParams();
  const { pages, setPages, loading, error, save, saving, saveMessage, globalSettings } = usePagesStore();
  const [library, setLibrary] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [deviceWidth, setDeviceWidth] = useState('Desktop - Large');

  useEffect(() => { getLibrary().then(setLibrary).catch(() => {}); }, []);

  const page = useMemo(() => pages?.find((p) => p.id === id), [pages, id]);
  const debouncedPage = useDebouncedValue(page, 250);
  const previewHtml = useMemo(() => {
    if (!debouncedPage || !pages || !globalSettings) return '';
    return compilePageHtml(debouncedPage, pages, library, globalSettings);
  }, [debouncedPage, pages, library, globalSettings]);

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!page) return <p className="text-zinc-300">Page not found. <Link to="/admin/pages" className="underline">Back to pages</Link></p>;

  const updatePage = (patch) => setPages(pages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const updateSections = (content) => updatePage({ content });

  const addSection = () => updateSections([...page.content, newSection()]);
  const addFromLibrary = (libId) => {
    const entry = library.find((l) => l.id === libId);
    if (!entry) return;
    updateSections([...page.content, { id: 'sec-' + Date.now(), name: entry.name, html: entry.html }]);
  };
  const updateSection = (secId, patch) => updateSections(page.content.map((s) => (s.id === secId ? { ...s, ...patch } : s)));
  const removeSection = (secId) => updateSections(page.content.filter((s) => s.id !== secId));
  const duplicateSection = (secId) => {
    const idx = page.content.findIndex((s) => s.id === secId);
    const copy = { ...page.content[idx], id: 'sec-' + Date.now() };
    const next = [...page.content];
    next.splice(idx + 1, 0, copy);
    updateSections(next);
  };
  const moveSection = (secId, dir) => {
    const idx = page.content.findIndex((s) => s.id === secId);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= page.content.length) return;
    const next = [...page.content];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    updateSections(next);
  };
  const reorderTo = (targetIndex) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...page.content];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    updateSections(next);
    setDragIndex(null);
  };

  const handleSave = async () => {
    try {
      await save(pages);
    } catch {
      // saveMessage already reflects the error
    }
  };

  const fullPath = getFullPath(page, pages);
  const previewHref = `/${fullPath}?preview=1`;
  const previewWidth = DEVICE_WIDTHS[deviceWidth];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <input
          value={page.name}
          onChange={(e) => updatePage({ name: e.target.value })}
          className="text-2xl font-semibold bg-transparent border-b border-transparent hover:border-white/20 focus:border-glass-indigo outline-none"
        />
        <div className="flex gap-2 items-center">
          {saveMessage && <span className="text-sm text-zinc-400">{saveMessage}</span>}
          <a href={previewHref} target="_blank" rel="noreferrer">
            <GlassButton variant="secondary">Open preview</GlassButton>
          </a>
          <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <div className="w-80 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-medium text-zinc-300">Blocks</h2>
            <div className="flex gap-2">
              {library.length > 0 && (
                <GlassSelect onChange={(e) => e.target.value && addFromLibrary(e.target.value)} defaultValue="" className="text-xs py-1">
                  <option value="">Insert from library…</option>
                  {library.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </GlassSelect>
              )}
              <button onClick={addSection} className="text-xs text-glass-sky hover:underline">Add</button>
            </div>
          </div>

          {page.content.length === 0 && <p className="text-zinc-500 text-sm">No sections yet.</p>}

          {page.content.map((section, idx) => (
            <BlockRow
              key={section.id}
              section={section}
              index={idx}
              total={page.content.length}
              expanded={expandedId === section.id}
              onToggle={() => setExpandedId(expandedId === section.id ? null : section.id)}
              onDragStart={setDragIndex}
              onDragOver={() => {}}
              onDrop={reorderTo}
              onRename={(name) => updateSection(section.id, { name })}
              onMove={(dir) => moveSection(section.id, dir)}
              onDuplicate={() => duplicateSection(section.id)}
              onRemove={() => removeSection(section.id)}
              onChange={(patch) => updateSection(section.id, patch)}
              pageId={page.id}
            />
          ))}
        </div>

        <GlassPanel className="flex-1 min-w-0 p-2 sticky top-6 self-start" style={{ height: 'calc(100vh - 9rem)' }}>
          <div className="flex justify-between items-center px-2 py-1 mb-1">
            <span className="text-xs text-zinc-400">Live preview</span>
            <GlassSelect value={deviceWidth} onChange={(e) => setDeviceWidth(e.target.value)} className="text-xs py-1">
              {Object.keys(DEVICE_WIDTHS).map((label) => <option key={label} value={label}>{label} ({DEVICE_WIDTHS[label]})</option>)}
            </GlassSelect>
          </div>
          <div className="w-full h-[calc(100%-2rem)] overflow-auto flex justify-center bg-black/20 rounded-xl">
            <iframe title="live-preview" srcDoc={previewHtml} className="h-full bg-white rounded-xl" style={{ width: previewWidth }} />
          </div>
        </GlassPanel>

        <div className="w-80 shrink-0 space-y-3">
          <GlassPanel className="p-4">
            <span className="text-xs text-zinc-400 block mb-1">URL</span>
            <p className="text-sm text-zinc-200 break-all">/{fullPath}</p>
          </GlassPanel>

          <CollapsibleSection title="Page settings" defaultOpen>
            <label className="text-xs text-zinc-400">Slug</label>
            <GlassInput value={page.slug} onChange={(e) => updatePage({ slug: e.target.value })} className="w-full mb-2 mt-1" />

            <label className="text-xs text-zinc-400">Parent</label>
            <GlassSelect
              value={page.parentId || ''}
              onChange={(e) => updatePage({ parentId: e.target.value || null })}
              className="w-full mb-2 mt-1"
            >
              <option value="">(none — top level)</option>
              {pages.filter((p) => p.id !== id).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </GlassSelect>

            <label className="text-xs text-zinc-400">Status</label>
            <GlassSelect value={page.status} onChange={(e) => updatePage({ status: e.target.value })} className="w-full mb-2 mt-1">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </GlassSelect>

            <label className="text-xs text-zinc-400">Scheduled publish</label>
            <GlassInput
              type="datetime-local"
              value={page.scheduledPublishAt ? new Date(page.scheduledPublishAt).toISOString().slice(0, 16) : ''}
              onChange={(e) => updatePage({ scheduledPublishAt: e.target.value ? new Date(e.target.value).getTime() : null })}
              className="w-full mt-1"
            />
          </CollapsibleSection>

          <CollapsibleSection title="SEO">
            <GlassInput placeholder="Title" value={page.seo?.title || ''} onChange={(e) => updatePage({ seo: { ...page.seo, title: e.target.value } })} className="w-full mb-1" />
            <GlassTextarea placeholder="Description" value={page.seo?.description || ''} onChange={(e) => updatePage({ seo: { ...page.seo, description: e.target.value } })} className="w-full mb-1" rows={2} />
            <GlassInput placeholder="OG image URL" value={page.seo?.ogImage || ''} onChange={(e) => updatePage({ seo: { ...page.seo, ogImage: e.target.value } })} className="w-full" />
          </CollapsibleSection>

          <CollapsibleSection title="Analytics snippets">
            <GlassTextarea placeholder="Head snippet" value={page.analytics?.headSnippet || ''} onChange={(e) => updatePage({ analytics: { ...page.analytics, headSnippet: e.target.value } })} className="w-full mb-1" rows={2} />
            <GlassTextarea placeholder="Body snippet" value={page.analytics?.bodySnippet || ''} onChange={(e) => updatePage({ analytics: { ...page.analytics, bodySnippet: e.target.value } })} className="w-full" rows={2} />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
