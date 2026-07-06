import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePagesStore } from '../lib/usePagesStore.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { compilePageHtml, getFullPath } from '../../shared/compilePage.js';
import { getLibrary, getAbStats, getComments, addComment, resolveComment, getNexusPages, saveNexusPages, getNexusLibrary, getPreviewToken } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect } from '../lib/ui/Glass.jsx';
import { useOrgBase } from '../lib/useMe.jsx';
import PasteInModal from '../lib/pasteIn/PasteInModal.jsx';
import StructuredBlockEditor from '../lib/pasteIn/StructuredBlockEditor.jsx';
import BlockCatalogPicker from '../lib/blocks/BlockCatalogPicker.jsx';
import { fetchBlockCatalog } from '../lib/blocks/catalog.js';

const newSection = () => ({ id: 'sec-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), name: 'New section', html: '<div class="p-8">New section</div>' });

const DEVICE_WIDTHS = { 'Desktop - Large': 1440, 'Tablet': 768, 'Mobile': 390 };
const ALL_EDIT_VIEWS = ['Structured', 'Raw HTML'];
const PAGE_MODES = ['Blocks', 'Full HTML'];

// Respects a workspace's optional lock (Design Settings > Page editor):
// 'structured' or 'raw' restricts every page's Structured/Raw HTML toggle
// to just that one option; unset (the default) allows both, matching
// today's behavior.
const editViewsFor = (lockBlockView) => {
  if (lockBlockView === 'structured') return ['Structured'];
  if (lockBlockView === 'raw') return ['Raw HTML'];
  return ALL_EDIT_VIEWS;
};

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
function BlockRow({ section, index, total, expanded, onToggle, onDragStart, onDragOver, onDrop, onRename, onMove, onDuplicate, onRemove, onChange, pageId, nexus, editView, catalogNameByType }) {
  // A block's origin (which catalog template it came from, or "Custom
  // HTML" for hand-authored/pasted/raw content) is tied to blockType, not
  // the editable `name` -- name can be freely renamed afterward, but
  // blockType is stamped once at insert time (buildSectionFromCatalog) and
  // never changes, so it's the reliable thing to label from.
  const origin = section.blockType ? (catalogNameByType[section.blockType] || section.blockType) : 'Custom HTML';
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
    >
      <GlassPanel className="p-4 mb-2 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 min-h-[2.25rem]">
          <button
            onClick={onToggle}
            aria-label={expanded ? 'Collapse section' : 'Expand section'}
            className="w-6 h-6 shrink-0 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 grid place-items-center text-xs"
          >
            {expanded ? '▾' : '▸'}
          </button>
          <span className="text-xs text-zinc-500 w-5 text-center shrink-0">{index + 1}</span>
          <button onClick={onToggle} className="flex-1 text-left py-2 -my-2 min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <input
                value={section.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onRename(e.target.value)}
                className="font-medium text-sm bg-transparent border-b border-transparent hover:border-white/20 outline-none min-w-0 flex-1"
              />
              <span className="text-[11px] text-zinc-500 shrink-0">{origin}</span>
            </div>
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
            {editView === 'Structured'
              ? <StructuredBlockEditor section={section} onChange={onChange} />
              : <GlassTextarea value={section.html} onChange={(e) => onChange({ html: e.target.value })} rows={6} className="w-full" />}
            {!nexus && <AbVariantsEditor section={section} onChange={onChange} />}
            {!nexus && <CommentsPanel pageId={pageId} sectionId={section.id} />}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

// Per-page Layout controls: whether this page inherits the site-global
// header/footer, plus optional inline override HTML. Precedence rules live
// in resolveGlobalContent() in src/shared/compilePage.js.
function LayoutPanel({ layout, globals, onChange }) {
  const [open, setOpen] = useState(false);
  const useHeader = layout.useGlobalHeader !== false;
  const useFooter = layout.useGlobalFooter !== false;
  const hasHeaderOverride = !!(layout.headerOverride && layout.headerOverride.trim());
  const hasFooterOverride = !!(layout.footerOverride && layout.footerOverride.trim());

  const summary = [
    hasHeaderOverride ? 'Header: override' : useHeader && globals.header?.html ? 'Header: global' : 'Header: off',
    hasFooterOverride ? 'Footer: override' : useFooter && globals.footer?.html ? 'Footer: global' : 'Footer: off',
  ].join(' · ');

  return (
    <GlassPanel className="p-3 mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <div>
          <div className="text-sm font-medium text-zinc-200">Layout</div>
          <div className="text-xs text-zinc-500">{summary}</div>
        </div>
        <span className="text-zinc-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          {['header', 'footer'].map((which) => {
            const flagKey = which === 'header' ? 'useGlobalHeader' : 'useGlobalFooter';
            const overrideKey = which === 'header' ? 'headerOverride' : 'footerOverride';
            const inheriting = layout[flagKey] !== false;
            const globalHtml = globals[which]?.html || '';
            return (
              <div key={which}>
                <label className="flex items-center gap-2 text-xs text-zinc-300 mb-1 capitalize">
                  <input
                    type="checkbox"
                    checked={inheriting}
                    onChange={(e) => onChange({ [flagKey]: e.target.checked })}
                    className="w-3.5 h-3.5"
                  />
                  Inherit site {which}
                  {!globalHtml && <span className="text-zinc-500 normal-case">(none set)</span>}
                </label>
                <GlassTextarea
                  value={layout[overrideKey] || ''}
                  onChange={(e) => onChange({ [overrideKey]: e.target.value })}
                  rows={3}
                  placeholder={`Optional per-page ${which} HTML (overrides global)`}
                  className="w-full font-mono text-xs"
                />
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

export default function PageEditorPage({ nexus = false }) {
  const { id } = useParams();
  const orgBase = useOrgBase();
  const base = nexus ? '/super-admin' : (orgBase || '/admin');
  const { pages, setPages, loading, error, save, saving, saveMessage, globalSettings } = usePagesStore(
    nexus ? { fetchPages: getNexusPages, savePages: saveNexusPages } : undefined
  );
  const [library, setLibrary] = useState([]);
  const [blockCatalog, setBlockCatalog] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [deviceWidth, setDeviceWidth] = useState('Desktop - Large');
  // Structured is the default -- the target user is the no-HTML crowd;
  // devs will find the Raw HTML toggle.
  const [editView, setEditView] = useState('Structured');
  const [pasteInOpen, setPasteInOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Unsaved-work protection: any page edit marks the editor dirty; a
  // browser-nav warning fires while dirty, Cmd/Ctrl+S saves, and an idle
  // autosave runs 30s after the LAST edit (re-armed per edit via
  // dirtyTick). Idle-based rather than interval-based on purpose --
  // usePagesStore.save() replaces local state with the server's response,
  // so saving mid-keystroke could clobber in-flight typing; only saving
  // after 30s of no edits keeps that window effectively closed.
  const dirtyRef = useRef(false);
  const saveRef = useRef(null);
  const [dirtyTick, setDirtyTick] = useState(0);
  const markDirty = () => { dirtyRef.current = true; setDirtyTick((t) => t + 1); };

  useEffect(() => {
    const onBeforeUnload = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current?.(); }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!dirtyTick) return;
    const t = setTimeout(() => { if (dirtyRef.current) saveRef.current?.(); }, 30000);
    return () => clearTimeout(t);
  }, [dirtyTick]);

  useEffect(() => { (nexus ? getNexusLibrary() : getLibrary()).then(setLibrary).catch(() => {}); }, [nexus]);
  useEffect(() => { fetchBlockCatalog().then(setBlockCatalog).catch(() => {}); }, []);
  const catalogNameByType = useMemo(
    () => Object.fromEntries(blockCatalog.map((e) => [e.blockType, e.name])),
    [blockCatalog]
  );
  const editViews = editViewsFor(globalSettings?.editor?.lockBlockView);
  const effectiveEditView = editViews.includes(editView) ? editView : editViews[0];

  const page = useMemo(() => pages?.find((p) => p.id === id), [pages, id]);
  const debouncedPage = useDebouncedValue(page, 250);
  const previewHtml = useMemo(() => {
    if (!debouncedPage || !pages || !globalSettings) return '';
    return compilePageHtml(debouncedPage, pages, library, globalSettings);
  }, [debouncedPage, pages, library, globalSettings]);

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!page) return <p className="text-zinc-300">Page not found. <Link to={`${base}/pages`} className="underline">Back to pages</Link></p>;

  const updatePage = (patch) => {
    markDirty();
    setPages(pages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const updateSections = (content) => updatePage({ content });
  const updateLayout = (patch) => updatePage({ layout: { ...(page.layout || {}), ...patch } });

  // Both `content` and `fullHtml` always persist on the page regardless of
  // mode -- switching back and forth never discards either representation,
  // it just changes which one compilePageHtml actually serves. Seeding
  // fullHtml from the current compiled output only happens the first time
  // (while it's still empty), so toggling back and forth never clobbers
  // edits already made in Full HTML mode.
  const setPageMode = (mode) => {
    const editorMode = mode === 'Full HTML' ? 'full-html' : 'blocks';
    if (editorMode === 'full-html' && !page.fullHtml && globalSettings) {
      updatePage({ editorMode, fullHtml: compilePageHtml(page, pages, library, globalSettings) });
    } else {
      updatePage({ editorMode });
    }
  };

  const addSection = () => updateSections([...page.content, newSection()]);
  const addFromLibrary = (libId) => {
    const entry = library.find((l) => l.id === libId);
    if (!entry) return;
    updateSections([...page.content, { id: 'sec-' + Date.now(), name: entry.name, html: entry.html }]);
  };
  const importPastedBlocks = (sections) => {
    updateSections([...page.content, ...sections]);
    setPasteInOpen(false);
  };
  const insertCatalogBlock = (section) => {
    updateSections([...page.content, section]);
    setCatalogOpen(false);
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
      dirtyRef.current = false;
    } catch {
      // saveMessage already reflects the error; stay dirty so the
      // beforeunload guard and autosave keep protecting the edits.
    }
  };
  saveRef.current = handleSave;

  const fullPath = getFullPath(page, pages);
  // Preview URLs carry a short-lived signed token instead of the old
  // `?preview=1` -- drafts are no longer readable by anyone who guesses
  // the URL. Token is fetched on click so it's always fresh.
  const openPreview = async () => {
    try {
      const { token } = await getPreviewToken(page.id, nexus);
      window.open(`/${fullPath}?preview=${encodeURIComponent(token)}`, '_blank', 'noopener');
    } catch {
      window.open(`/${fullPath}`, '_blank', 'noopener');
    }
  };
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
          <GlassButton variant="secondary" onClick={openPreview}>Open preview</GlassButton>
          <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <div className="w-2/5 min-w-0 shrink-0">
          <div className="flex items-center gap-1 mb-3 p-0.5 rounded-lg bg-white/[0.04] border border-white/10 w-fit">
            {PAGE_MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => setPageMode(mode)}
                className={`text-xs px-2.5 py-1 rounded-md transition ${
                  (page.editorMode === 'full-html') === (mode === 'Full HTML') ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {page.editorMode === 'full-html' ? (
            <>
              <p className="text-xs text-zinc-500 mb-2">
                Full document control -- header, footer, theme, and analytics injection are all bypassed for this page. What you write here is exactly what gets served. Requires workspace admin to save.
              </p>
              <GlassTextarea
                value={page.fullHtml || ''}
                onChange={(e) => updatePage({ fullHtml: e.target.value })}
                rows={32}
                className="w-full font-mono text-xs"
                placeholder="<!doctype html>&#10;<html>&#10;<head>...</head>&#10;<body>...</body>&#10;</html>"
              />
            </>
          ) : (
            <>
              <LayoutPanel
                layout={page.layout || {}}
                globals={globalSettings?.globals || {}}
                onChange={updateLayout}
              />
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-medium text-zinc-300">Blocks</h2>
                <div className="flex gap-2">
                  {library.length > 0 && (
                    <GlassSelect onChange={(e) => e.target.value && addFromLibrary(e.target.value)} defaultValue="" className="text-xs py-1">
                      <option value="">Insert from library…</option>
                      {library.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </GlassSelect>
                  )}
                  <button onClick={() => setPasteInOpen(true)} className="text-xs text-glass-sky hover:underline">Paste in…</button>
                  <button onClick={addSection} className="text-xs text-glass-sky hover:underline">Blank</button>
                </div>
              </div>

              <GlassButton onClick={() => setCatalogOpen(true)} className="w-full mb-3 justify-center">
                Add Layout/Block +
              </GlassButton>

              {editViews.length > 1 && (
                <div className="flex items-center gap-1 mb-3 p-0.5 rounded-lg bg-white/[0.04] border border-white/10 w-fit">
                  {editViews.map((v) => (
                    <button
                      key={v}
                      onClick={() => setEditView(v)}
                      className={`text-xs px-2.5 py-1 rounded-md transition ${
                        effectiveEditView === v ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}

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
                  nexus={nexus}
                  editView={effectiveEditView}
                  catalogNameByType={catalogNameByType}
                />
              ))}
            </>
          )}
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

        <div className="w-1/5 min-w-0 shrink-0 space-y-3">
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

      {pasteInOpen && <PasteInModal onClose={() => setPasteInOpen(false)} onImport={importPastedBlocks} />}
      {catalogOpen && <BlockCatalogPicker onClose={() => setCatalogOpen(false)} onInsert={insertCatalogBlock} />}
    </div>
  );
}
