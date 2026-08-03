import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Layers, Plus, ClipboardPaste, Square, Trash2, Copy, ChevronUp, ChevronDown, GripVertical,
  SlidersHorizontal, Paintbrush, FileCog, Code2, Blocks, ArrowLeftRight, EyeOff, X, ShieldCheck,
} from 'lucide-react';
import { usePagesStore } from '../lib/usePagesStore.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { compilePageHtml, getFullPath } from '../../shared/compilePage.js';
import { getLibrary, getAbStats, getComments, addComment, resolveComment, getNexusPages, saveNexusPages, getNexusLibrary, getPreviewToken } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect, Badge } from '../lib/ui/Glass.jsx';
import { useOrgBase, useIsAdmin, useIsSuperAdmin } from '../lib/useMe.jsx';
import PasteInModal from '../lib/pasteIn/PasteInModal.jsx';
import StructuredBlockEditor from '../lib/pasteIn/StructuredBlockEditor.jsx';
import BlockCatalogPicker from '../lib/blocks/BlockCatalogPicker.jsx';
import ScaledPreviewFrame from '../lib/ScaledPreviewFrame.jsx';
import { fetchBlockCatalog } from '../lib/blocks/catalog.js';
import DesignInspector, { DEVICES } from '../lib/design/DesignInspector.jsx';
import { describeSectionStyle, hasSectionStyle, normalizeSectionStyle } from '../../shared/blockStyle.js';
import { readExperiment, formatRate } from '../../shared/abStats.js';
import { auditPage } from '../../shared/pageAudit.js';
import { PAGE_MODES, modeOf, otherMode, conversionSummary } from '../lib/pageModes.js';
import { convertPage } from '../lib/pageActions.js';

const newSection = () => ({ id: 'sec-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), name: 'New section', html: '<div class="p-8">New section</div>' });

const ALL_EDIT_VIEWS = ['Fields', 'HTML'];

// Respects a workspace's optional lock (Design Settings > Page editor):
// 'structured' or 'raw' restricts every page's Fields/HTML toggle to just
// that one option; unset (the default) allows both.
const editViewsFor = (lockBlockView) => {
  if (lockBlockView === 'structured') return ['Fields'];
  if (lockBlockView === 'raw') return ['HTML'];
  return ALL_EDIT_VIEWS;
};

// The editor canvas is the real compiled page plus a thin editing layer:
// a highlight on the selected block, a hover outline, and a click handler
// that reports the clicked block back so the canvas doubles as a picker.
// None of this reaches the published page -- it's appended to the srcDoc
// only, which is why it lives here rather than in compilePageHtml.
function withEditorOverlay(html, selectedId) {
  if (!html) return html;
  const overlay = `
<style id="nx-editor-overlay">
  [data-section-id]{position:relative;transition:outline-color .12s ease}
  [data-section-id]:hover{outline:1px dashed rgba(99,102,241,.55);outline-offset:-1px;cursor:pointer}
  ${selectedId ? `[data-section-id="${selectedId}"]{outline:2px solid #6366f1;outline-offset:-2px}` : ''}
</style>
<script>
(function(){
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('[data-section-id]') : null;
    // Swallow the click either way: in the editor a stray link navigation
    // would replace the preview document with the live site.
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage({ type: 'nx-select-section', id: el ? el.getAttribute('data-section-id') : null }, '*');
  }, true);
  document.addEventListener('submit', function(e){ e.preventDefault(); }, true);
})();
</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${overlay}\n</body>`) : html + overlay;
}

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

  // Promoting a winner makes it the block's own content and ends the test.
  // That's the whole point of running one, and doing it by hand meant
  // copy-pasting HTML between two textareas.
  const promote = (variant) => {
    if (!confirm(`Make "${variant.name}" the permanent content of this block and stop the test?`)) return;
    onChange({ ...section, html: variant.html, abVariants: [] });
  };

  const { results, verdict, leader } = readExperiment(variants, stats);
  const VERDICT_TONE = {
    winner: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200',
    collecting: 'border-white/10 bg-white/[0.03] text-zinc-400',
    'no-difference': 'border-white/10 bg-white/[0.03] text-zinc-300',
    idle: 'border-white/10 bg-white/[0.03] text-zinc-500',
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-zinc-400">A/B variants</span>
        <button onClick={addVariant} className="text-xs text-glass-sky hover:underline">Add variant</button>
      </div>

      {variants.length > 0 && verdict && (
        <div className={`rounded-lg border px-2.5 py-2 mb-2 ${VERDICT_TONE[verdict.state]}`}>
          <p className="text-[11px] leading-relaxed">{verdict.message}</p>
          {leader && (
            <button onClick={() => promote(variants.find((v) => v.id === leader.id))} className="text-[11px] underline hover:text-white mt-1">
              Use &quot;{leader.name}&quot; and end the test
            </button>
          )}
        </div>
      )}

      {variants.map((v) => {
        const r = results.find((x) => x.id === v.id);
        return (
          <GlassPanel key={v.id} className="p-2 mb-2">
            <div className="flex gap-2 items-center mb-1">
              <GlassInput value={v.name} onChange={(e) => updateVariant(v.id, { name: e.target.value })} className="flex-1 py-1" />
              <GlassInput type="number" min="0" value={v.weight} onChange={(e) => updateVariant(v.id, { weight: Number(e.target.value) })} className="w-16 py-1" title="Share of traffic — 0 holds this variant back" />
              <GlassButton variant="danger" onClick={() => removeVariant(v.id)}>Remove</GlassButton>
            </div>
            <GlassTextarea value={v.html} onChange={(e) => updateVariant(v.id, { html: e.target.value })} rows={3} className="w-full" />
            {r && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 mt-1">
                <span>{r.impressions} views · {r.clicks} clicks</span>
                <span className="text-zinc-300">{formatRate(r.rate)}</span>
                {r.isControl && <span className="text-zinc-600">control</span>}
                {!r.isControl && r.enoughData && (
                  <span className={r.significant ? (r.lift > 0 ? 'text-emerald-300' : 'text-red-300') : 'text-zinc-600'}>
                    {r.lift >= 0 ? '+' : ''}{(r.lift * 100).toFixed(0)}%{r.significant ? '' : ' (not conclusive)'}
                  </span>
                )}
                {!r.isControl && !r.enoughData && <span className="text-zinc-600">too early to say</span>}
                {!r.isControl && r.significant && r.lift > 0 && (
                  <button onClick={() => promote(v)} className="text-glass-sky hover:underline">Promote</button>
                )}
              </div>
            )}
          </GlassPanel>
        );
      })}
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] mb-2 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex justify-between items-center w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition">
        <span className="text-sm text-zinc-200">{title}</span>
        <ChevronDown size={14} className={`text-zinc-500 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-white/[0.07]">{children}</div>}
    </div>
  );
}

// One row in the Layers list. Selection (not inline expansion) is what drives
// the inspector on the right, so a row stays one line tall no matter how many
// fields the block has. Drag-and-drop reorder uses native HTML5 DnD.
function LayerRow({ section, index, total, selected, onSelect, onDragStart, onDragOver, onDrop, onMove, onDuplicate, onRemove, catalogNameByType }) {
  // A block's origin (which catalog template it came from, or "Custom HTML"
  // for hand-authored/pasted/raw content) is tied to blockType, not the
  // editable `name` -- name can be freely renamed afterward, but blockType is
  // stamped once at insert time and never changes.
  const origin = section.blockType ? (catalogNameByType[section.blockType] || section.blockType) : 'Custom HTML';
  const design = describeSectionStyle(section.style);
  const hiddenSomewhere = !!section.style?.hideOn && Object.keys(section.style.hideOn).length > 0;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
      onClick={onSelect}
      className={`group rounded-xl border mb-1.5 px-2 py-2 cursor-pointer transition ${
        selected
          ? 'border-glass-indigo/60 bg-glass-indigo/[0.12]'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripVertical size={13} className="text-zinc-600 shrink-0 cursor-grab active:cursor-grabbing" />
        <span className="text-[10px] text-zinc-600 w-3 text-center shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm truncate ${selected ? 'text-zinc-100 font-medium' : 'text-zinc-200'}`}>{section.name}</span>
            {hiddenSomewhere && <EyeOff size={11} className="text-amber-400/70 shrink-0" />}
          </div>
          <div className="text-[10px] text-zinc-500 truncate">
            {origin}{design ? ` · ${design}` : ''}
          </div>
        </div>
        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          <button onClick={(e) => { e.stopPropagation(); onMove(-1); }} disabled={index === 0} title="Move up" className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-25"><ChevronUp size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); onMove(1); }} disabled={index === total - 1} title="Move down" className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-25"><ChevronDown size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Duplicate" className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"><Copy size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Delete" className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

// Per-page Layout controls: whether this page inherits the site-global
// header/footer, plus optional inline override HTML. Precedence rules live
// in resolveGlobalContent() in src/shared/compilePage.js.
function LayoutPanel({ layout, globals, onChange }) {
  const useHeader = layout.useGlobalHeader !== false;
  const useFooter = layout.useGlobalFooter !== false;
  const hasHeaderOverride = !!(layout.headerOverride && layout.headerOverride.trim());
  const hasFooterOverride = !!(layout.footerOverride && layout.footerOverride.trim());

  const summary = [
    hasHeaderOverride ? 'Header: override' : useHeader && globals.header?.html ? 'Header: global' : 'Header: off',
    hasFooterOverride ? 'Footer: override' : useFooter && globals.footer?.html ? 'Footer: global' : 'Footer: off',
  ].join(' · ');

  return (
    <CollapsibleSection title="Header & footer">
      <p className="text-[11px] text-zinc-500 mb-2">{summary}</p>
      {['header', 'footer'].map((which) => {
        const flagKey = which === 'header' ? 'useGlobalHeader' : 'useGlobalFooter';
        const overrideKey = which === 'header' ? 'headerOverride' : 'footerOverride';
        const inheriting = layout[flagKey] !== false;
        const globalHtml = globals[which]?.html || '';
        return (
          <div key={which} className="mb-2">
            <label className="flex items-center gap-2 text-xs text-zinc-300 mb-1 capitalize">
              <input
                type="checkbox"
                checked={inheriting}
                onChange={(e) => onChange({ [flagKey]: e.target.checked })}
                className="w-3.5 h-3.5"
              />
              Use the site {which}
              {!globalHtml && <span className="text-zinc-500 normal-case">(none set)</span>}
            </label>
            <GlassTextarea
              value={layout[overrideKey] || ''}
              onChange={(e) => onChange({ [overrideKey]: e.target.value })}
              rows={3}
              placeholder={`Optional per-page ${which} HTML (overrides the site ${which})`}
              className="w-full font-mono text-xs"
            />
          </div>
        );
      })}
    </CollapsibleSection>
  );
}

// Accessibility and SEO findings for the page being edited. Sits in the Page
// tab because most of what it reports is page-level (headings, metadata,
// theme contrast) even though individual findings point at a block.
function AuditPanel({ page, globalSettings, onSelectSection }) {
  const { issues, counts, score, skipped } = auditPage(page, globalSettings);

  if (skipped) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] mb-2 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm text-zinc-200"><ShieldCheck size={14} className="text-zinc-400" /> Checks</div>
        <p className="text-[11px] text-zinc-500 mt-1">Not run on full-code pages — the markup is yours end to end.</p>
      </div>
    );
  }

  const tone = counts.error ? 'text-red-300' : counts.warning ? 'text-amber-300' : 'text-emerald-300';
  const LEVEL_DOT = { error: 'bg-red-400', warning: 'bg-amber-400', info: 'bg-sky-400' };

  return (
    <CollapsibleSection
      title={`Checks — ${score}/100`}
      defaultOpen={counts.error > 0}
    >
      <p className={`text-xs mb-2 ${tone}`}>
        {issues.length === 0
          ? 'No accessibility or SEO problems found.'
          : `${counts.error} to fix · ${counts.warning} to look at · ${counts.info} for information`}
      </p>
      {issues.map((issue, i) => (
        <div key={`${issue.id}-${i}`} className="flex gap-2 py-1.5 border-t border-white/[0.06] first:border-t-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${LEVEL_DOT[issue.level]}`} />
          <div className="min-w-0">
            <div className="text-xs text-zinc-200">{issue.title}</div>
            <div className="text-[11px] text-zinc-500 leading-relaxed">{issue.detail}</div>
            {issue.sectionId && (
              <button onClick={() => onSelectSection(issue.sectionId)} className="text-[11px] text-glass-sky hover:underline mt-0.5">
                Go to block
              </button>
            )}
          </div>
        </div>
      ))}
    </CollapsibleSection>
  );
}

// The Convert card in the Page tab. Conversion is additive by design -- it
// produces a separate DRAFT copy and leaves this page untouched -- so the
// confirmation spells out exactly what the copy will and won't carry over.
function ModeCard({ page, canUseFullCode, converting, onConvert }) {
  const [confirming, setConfirming] = useState(false);
  const mode = modeOf(page);
  const target = otherMode(mode);
  const current = PAGE_MODES[mode];
  const next = PAGE_MODES[target];
  const blocked = target === 'full-html' && !canUseFullCode;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] mb-2 px-3 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        {mode === 'full-html' ? <Code2 size={14} className="text-zinc-400" /> : <Blocks size={14} className="text-zinc-400" />}
        <span className="text-sm text-zinc-200">This page is a</span>
        <Badge tone="default">{current.label} page</Badge>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed mb-2.5">{current.description}</p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={blocked}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-200 py-2 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ArrowLeftRight size={12} /> Convert to a {next.label.toLowerCase()} page
        </button>
      ) : (
        <div className="rounded-lg border border-glass-indigo/30 bg-glass-indigo/[0.08] p-2.5">
          <p className="text-xs text-zinc-100 mb-1.5">Convert to {next.label.toLowerCase()}?</p>
          <ul className="text-[11px] text-zinc-400 leading-relaxed list-disc pl-4 space-y-0.5 mb-2.5">
            {conversionSummary(page, target).map((line) => <li key={line}>{line}</li>)}
            <li className="text-zinc-300"><strong>This page is not changed</strong> — it keeps serving exactly as it does now.</li>
          </ul>
          <div className="flex gap-2">
            <GlassButton onClick={() => onConvert(target)} disabled={converting} className="flex-1 justify-center py-1.5 text-xs">
              {converting ? 'Creating copy…' : 'Create the draft copy'}
            </GlassButton>
            <button onClick={() => setConfirming(false)} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Cancel</button>
          </div>
        </div>
      )}

      {blocked && (
        <p className="text-[11px] text-amber-300/80 mt-2">Only workspace admins can create full-code pages.</p>
      )}
    </div>
  );
}

// The Content tab: the selected block's own fields (or its raw HTML), plus
// the experiment/comment tooling that belongs to that block.
function ContentInspector({ section, onChange, editViews, editView, setEditView, pageId, nexus }) {
  const structuredAvailable = !!(section.blockType && section.fields);
  return (
    <div>
      {editViews.length > 1 && (
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10 mb-3">
          {editViews.map((v) => (
            <button
              key={v}
              onClick={() => setEditView(v)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition ${
                editView === v ? 'bg-white/15 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {v === 'Fields' ? <SlidersHorizontal size={12} /> : <Code2 size={12} />}
              {v}
            </button>
          ))}
        </div>
      )}

      {editView === 'Fields' ? (
        structuredAvailable ? (
          <StructuredBlockEditor section={section} onChange={onChange} />
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              This block is raw HTML, so there are no fields to fill in. Edit it under
              {' '}<strong className="text-zinc-200">HTML</strong>, restyle it in
              {' '}<strong className="text-zinc-200">Design</strong>, or replace it with a
              catalog block to get field-by-field editing.
            </p>
          </div>
        )
      ) : (
        <GlassTextarea
          value={section.html || ''}
          onChange={(e) => onChange({ html: e.target.value })}
          rows={20}
          className="w-full font-mono text-xs"
        />
      )}

      {!nexus && <AbVariantsEditor section={section} onChange={onChange} />}
      {!nexus && <CommentsPanel pageId={pageId} sectionId={section.id} />}
    </div>
  );
}

export default function PageEditorPage({ nexus = false }) {
  const { id, orgSlug } = useParams();
  const navigate = useNavigate();
  const orgBase = useOrgBase();
  const isAdmin = useIsAdmin();
  const isSuperAdmin = useIsSuperAdmin();
  const base = nexus ? '/super-admin' : (orgBase || '/admin');
  const { pages, setPages, loading, error, save, saving, saveMessage, globalSettings, setGlobalSettings, reload, conflict, dismissConflict } = usePagesStore(
    nexus ? { fetchPages: getNexusPages, savePages: saveNexusPages } : undefined
  );
  const [library, setLibrary] = useState([]);
  const [blockCatalog, setBlockCatalog] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('page');
  const [device, setDevice] = useState('desktop');
  const [dragIndex, setDragIndex] = useState(null);
  // Structured is the default -- the target user is the no-HTML crowd;
  // devs will find the HTML toggle.
  const [editView, setEditView] = useState('Fields');
  const [pasteInOpen, setPasteInOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [converting, setConverting] = useState(false);

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

  // Undo/redo over `page.content` snapshots (last 50). Native undo inside
  // a focused input/textarea is left alone -- the global handler only
  // fires when focus is outside a text field, so Cmd+Z while typing still
  // means "undo my typing," not "undo my block edit."
  // Mirrors `conflict` for the autosave timer, which must not keep retrying
  // (and re-showing the banner) every 30s while the user decides what to do.
  const conflictRef = useRef(null);
  const historyRef = useRef({ pageId: null, past: [], future: [] });
  const undoRef = useRef(null);
  const redoRef = useRef(null);
  const [undoToast, setUndoToast] = useState(null);

  useEffect(() => {
    const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    const onBeforeUnload = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current?.(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isTyping(e)) {
        e.preventDefault();
        (e.shiftKey ? redoRef.current : undoRef.current)?.();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Clicking a block on the canvas selects it (see withEditorOverlay). The
  // iframe is same-origin srcDoc, so a plain postMessage is enough; the id
  // is checked against the page's own sections before it's trusted.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type !== 'nx-select-section') return;
      setSelectedId(e.data.id || null);
      if (e.data.id) setTab((t) => (t === 'page' ? 'content' : t));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!undoToast) return;
    const t = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(t);
  }, [undoToast]);

  useEffect(() => {
    if (!dirtyTick || conflictRef.current) return;
    const t = setTimeout(() => { if (dirtyRef.current && !conflictRef.current) saveRef.current?.(); }, 30000);
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
    return withEditorOverlay(compilePageHtml(debouncedPage, pages, library, globalSettings), selectedId);
  }, [debouncedPage, pages, library, globalSettings, selectedId]);

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!page) return <p className="text-zinc-300">Page not found. <Link to={`${base}/pages`} className="underline">Back to pages</Link></p>;

  const mode = modeOf(page);
  const isFullCode = mode === 'full-html';
  const selected = isFullCode ? null : (page.content || []).find((s) => s.id === selectedId) || null;

  const updatePage = (patch) => {
    markDirty();
    setPages(pages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  // Every content mutation flows through updateSections, so pushing the
  // pre-change snapshot here covers add/remove/reorder/edit uniformly.
  // History resets when navigating to a different page.
  if (historyRef.current.pageId !== id) historyRef.current = { pageId: id, past: [], future: [] };
  const updateSections = (content) => {
    const h = historyRef.current;
    h.past = [...h.past.slice(-49), page.content];
    h.future = [];
    updatePage({ content });
  };
  const applySnapshot = (content) => updatePage({ content });
  undoRef.current = () => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    h.future = [page.content, ...h.future.slice(0, 49)];
    applySnapshot(h.past[h.past.length - 1]);
    h.past = h.past.slice(0, -1);
    setUndoToast(null);
  };
  redoRef.current = () => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    h.past = [...h.past.slice(-49), page.content];
    applySnapshot(h.future[0]);
    h.future = h.future.slice(1);
  };
  const updateLayout = (patch) => updatePage({ layout: { ...(page.layout || {}), ...patch } });

  // Saved design presets live in the workspace's global settings, so they
  // follow the site rather than one browser. Only an admin can save
  // globalSettings, so an editor sees and applies presets but can't add one —
  // the server would reject the write anyway (see POST /api/pages).
  const designPresets = globalSettings?.designPresets || [];
  const savePreset = (name, style) => {
    const clean = normalizeSectionStyle(style);
    if (!clean) return;
    const next = [...designPresets.filter((p) => p.name !== name), { name, style: clean }].slice(-40);
    setGlobalSettings({ ...globalSettings, designPresets: next });
    markDirty();
  };
  const deletePreset = (name) => {
    setGlobalSettings({ ...globalSettings, designPresets: designPresets.filter((p) => p.name !== name) });
    markDirty();
  };

  const selectSection = (secId) => {
    setSelectedId(secId);
    if (secId && tab === 'page') setTab('content');
  };

  const addSection = () => {
    const section = newSection();
    updateSections([...page.content, section]);
    selectSection(section.id);
  };
  const addFromLibrary = (libId) => {
    const entry = library.find((l) => l.id === libId);
    if (!entry) return;
    const section = { id: 'sec-' + Date.now(), name: entry.name, html: entry.html };
    updateSections([...page.content, section]);
    selectSection(section.id);
  };
  const importPastedBlocks = (sections) => {
    updateSections([...page.content, ...sections]);
    setPasteInOpen(false);
    if (sections[0]) selectSection(sections[0].id);
  };
  const insertCatalogBlock = (section) => {
    updateSections([...page.content, section]);
    setCatalogOpen(false);
    selectSection(section.id);
  };
  const updateSection = (secId, patch) => updateSections(page.content.map((s) => (s.id === secId ? { ...s, ...patch } : s)));
  const removeSection = (secId) => {
    const removed = page.content.find((s) => s.id === secId);
    updateSections(page.content.filter((s) => s.id !== secId));
    if (selectedId === secId) { setSelectedId(null); setTab('page'); }
    setUndoToast({ label: `Deleted "${removed?.name || 'block'}"` });
  };
  const duplicateSection = (secId) => {
    const idx = page.content.findIndex((s) => s.id === secId);
    const copy = { ...structuredClone(page.content[idx]), id: 'sec-' + Date.now() };
    const next = [...page.content];
    next.splice(idx + 1, 0, copy);
    updateSections(next);
    selectSection(copy.id);
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

  conflictRef.current = conflict;

  const handleSave = async (opts) => {
    try {
      await save(pages, globalSettings, opts);
      dirtyRef.current = false;
    } catch {
      // saveMessage already reflects the error; stay dirty so the
      // beforeunload guard and autosave keep protecting the edits.
    }
  };
  saveRef.current = handleSave;

  // Convert leaves this page alone and appends a draft copy, so the current
  // page's unsaved edits have to be flushed as part of the same save --
  // convertPage() saves the whole pages array, which includes them.
  const handleConvert = async (targetMode) => {
    setConverting(true);
    try {
      await convertPage(page, pages, setPages, save, navigate, base, targetMode, { library, globalSettings });
      dirtyRef.current = false;
      setSelectedId(null);
      setTab('page');
    } catch {
      // saveMessage carries the error.
    } finally {
      setConverting(false);
    }
  };

  const fullPath = getFullPath(page, pages);
  // Preview URLs carry a short-lived signed token instead of the old
  // `?preview=1` -- drafts are no longer readable by anyone who guesses
  // the URL. Token is fetched on click so it's always fresh.
  const openPreview = async () => {
    try {
      const { token } = await getPreviewToken(page.id, nexus);
      // Nexus's own site is served on the platform host (isPlatform), so the
      // host-based route works for it. A client workspace has no host mapping
      // on the shared platform host, so it needs the org-explicit render route.
      const url = nexus
        ? `/${fullPath}?preview=${encodeURIComponent(token)}`
        : `/api/preview/${encodeURIComponent(orgSlug)}/${encodeURIComponent(page.id)}?token=${encodeURIComponent(token)}`;
      window.open(url, '_blank', 'noopener');
    } catch {
      window.open(`/${fullPath}`, '_blank', 'noopener');
    }
  };

  const previewWidth = DEVICES.find((d) => d.value === device)?.width || 1440;
  const TABS = [
    { key: 'content', label: 'Content', icon: SlidersHorizontal, needsBlock: true },
    { key: 'design', label: 'Design', icon: Paintbrush, needsBlock: true },
    { key: 'page', label: 'Page', icon: FileCog, needsBlock: false },
  ];
  const activeTab = selected || tab === 'page' ? tab : 'page';

  return (
    <div>
      {conflict && (
        <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/[0.08] px-4 py-3">
          <p className="text-sm text-amber-200">{conflict.message}</p>
          <p className="text-[11px] text-amber-200/70 mt-1 leading-relaxed">
            Your changes are still here and have not been saved. Reloading replaces them with the
            newer version; overwriting keeps yours and discards theirs.
            {conflict.conflicts.length > 0 && (
              <> Affected: {conflict.conflicts.map((c) => c.name).join(', ')}.</>
            )}
          </p>
          <div className="flex gap-2 mt-2.5">
            <GlassButton variant="secondary" onClick={() => { dirtyRef.current = false; reload(); }} className="py-1.5 text-xs">
              Reload theirs (discard mine)
            </GlassButton>
            <GlassButton onClick={() => handleSave({ force: true })} disabled={saving} className="py-1.5 text-xs">
              Overwrite with mine
            </GlassButton>
            <button onClick={dismissConflict} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Keep editing</button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:flex-wrap sm:justify-between sm:items-center">
        <div className="flex items-center gap-2 min-w-0">
          <input
            value={page.name}
            onChange={(e) => updatePage({ name: e.target.value })}
            className="text-2xl font-semibold bg-transparent border-b border-transparent hover:border-white/20 focus:border-glass-indigo outline-none w-full min-w-0 sm:w-auto"
          />
          <Badge tone={page.status === 'published' ? 'published' : 'draft'}>{page.status}</Badge>
          <Badge>{PAGE_MODES[mode].label}</Badge>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10">
            {DEVICES.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.value}
                  onClick={() => setDevice(d.value)}
                  title={`${d.label} (${d.width}px)`}
                  className={`px-2 py-1.5 rounded-md transition ${device === d.value ? 'bg-white/15 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
          {saveMessage && <span className="text-sm text-zinc-400">{saveMessage}</span>}
          <GlassButton variant="secondary" onClick={openPreview}>Open preview</GlassButton>
          <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* Left: layers / code */}
        <GlassPanel className="w-full min-w-0 p-3 self-start overflow-y-auto lg:w-[19rem] lg:shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)]">
          {isFullCode ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Code2 size={14} className="text-zinc-400" />
                <span className="text-sm font-medium text-zinc-200">HTML document</span>
              </div>
              <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">
                Full document control — the site header, footer, theme and analytics injection are all
                bypassed for this page. What you write here is exactly what gets served.
                Requires a workspace admin to save.
              </p>
              <GlassTextarea
                value={page.fullHtml || ''}
                onChange={(e) => updatePage({ fullHtml: e.target.value })}
                rows={34}
                className="w-full font-mono text-[11px]"
                placeholder="<!doctype html>&#10;<html>&#10;<head>...</head>&#10;<body>...</body>&#10;</html>"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-200">Blocks</span>
                  <span className="text-[11px] text-zinc-600">{page.content.length}</span>
                </div>
              </div>

              <GlassButton onClick={() => setCatalogOpen(true)} className="w-full mb-2 justify-center py-1.5 text-xs">
                <Plus size={13} /> Add a block
              </GlassButton>
              <div className="flex gap-1.5 mb-3">
                <button onClick={() => setPasteInOpen(true)} className="flex-1 flex items-center justify-center gap-1 text-[11px] text-zinc-300 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 transition">
                  <ClipboardPaste size={12} /> Paste in
                </button>
                <button onClick={addSection} className="flex-1 flex items-center justify-center gap-1 text-[11px] text-zinc-300 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 transition">
                  <Square size={12} /> Blank
                </button>
              </div>
              {library.length > 0 && (
                <GlassSelect onChange={(e) => { if (e.target.value) { addFromLibrary(e.target.value); e.target.value = ''; } }} defaultValue="" className="w-full text-xs py-1.5 mb-3">
                  <option value="">Insert from library…</option>
                  {library.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </GlassSelect>
              )}

              {page.content.length === 0 && (
                <p className="text-xs text-zinc-500 py-6 text-center leading-relaxed">
                  No blocks yet.<br />Add one to start building.
                </p>
              )}

              {page.content.map((section, idx) => (
                <LayerRow
                  key={section.id}
                  section={section}
                  index={idx}
                  total={page.content.length}
                  selected={selectedId === section.id}
                  onSelect={() => selectSection(section.id)}
                  onDragStart={setDragIndex}
                  onDragOver={() => {}}
                  onDrop={reorderTo}
                  onMove={(dir) => moveSection(section.id, dir)}
                  onDuplicate={() => duplicateSection(section.id)}
                  onRemove={() => removeSection(section.id)}
                  catalogNameByType={catalogNameByType}
                />
              ))}
            </>
          )}
        </GlassPanel>

        {/* Centre: canvas */}
        <GlassPanel className="w-full min-w-0 lg:flex-1 p-2 self-start lg:sticky lg:top-6 h-[70vh] lg:h-[calc(100vh-9rem)]">
          <div className="flex justify-between items-center px-2 py-1 mb-1">
            <span className="text-xs text-zinc-400">
              {isFullCode ? 'Live preview' : 'Click a block on the canvas to select it'}
            </span>
            <span className="text-[11px] text-zinc-600">{previewWidth}px</span>
          </div>
          <div className="w-full h-[calc(100%-2rem)] overflow-auto bg-black/20 rounded-xl">
            <ScaledPreviewFrame srcDoc={previewHtml} baseWidth={previewWidth} autoHeight interactive bg="#fff" />
          </div>
        </GlassPanel>

        {/* Right: inspector */}
        <GlassPanel className="w-full min-w-0 p-3 self-start overflow-y-auto lg:w-[21rem] lg:shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)]">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10 mb-3">
            {TABS.map((t) => {
              const Icon = t.icon;
              const disabled = t.needsBlock && !selected;
              return (
                <button
                  key={t.key}
                  disabled={disabled}
                  onClick={() => setTab(t.key)}
                  title={disabled ? 'Select a block first' : t.label}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition ${
                    activeTab === t.key ? 'bg-white/15 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-500'
                  }`}
                >
                  <Icon size={12} /> {t.label}
                </button>
              );
            })}
          </div>

          {selected && activeTab !== 'page' && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <input
                value={selected.name}
                onChange={(e) => updateSection(selected.id, { name: e.target.value })}
                className="flex-1 min-w-0 text-sm font-medium text-zinc-100 bg-transparent border-b border-transparent hover:border-white/20 focus:border-glass-indigo outline-none py-0.5"
              />
              {hasSectionStyle(selected.style) && <span className="w-1.5 h-1.5 rounded-full bg-glass-sky" title="This block has custom design" />}
              <button onClick={() => { setSelectedId(null); setTab('page'); }} title="Deselect" className="text-zinc-500 hover:text-zinc-200"><X size={13} /></button>
            </div>
          )}

          {activeTab === 'content' && selected && (
            <ContentInspector
              section={selected}
              onChange={(patch) => updateSection(selected.id, patch)}
              editViews={editViews}
              editView={effectiveEditView}
              setEditView={setEditView}
              pageId={page.id}
              nexus={nexus}
            />
          )}

          {activeTab === 'design' && selected && (
            <DesignInspector
              style={selected.style || {}}
              onChange={(style) => updateSection(selected.id, { style: Object.keys(style).length ? style : undefined })}
              device={device}
              onDeviceChange={setDevice}
              theme={globalSettings?.theme || {}}
              presets={designPresets}
              onSavePreset={isAdmin || nexus ? savePreset : undefined}
              onDeletePreset={deletePreset}
            />
          )}

          {activeTab === 'page' && (
            <>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] mb-2 px-3 py-2.5">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500 block mb-1">Address</span>
                <p className="text-sm text-zinc-200 break-all">/{fullPath}</p>
              </div>

              <ModeCard
                page={page}
                canUseFullCode={nexus ? isSuperAdmin : isAdmin}
                converting={converting}
                onConvert={handleConvert}
              />

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

              {!isFullCode && (
                <LayoutPanel
                  layout={page.layout || {}}
                  globals={globalSettings?.globals || {}}
                  onChange={updateLayout}
                />
              )}

              <AuditPanel page={page} globalSettings={globalSettings} onSelectSection={selectSection} />

              <CollapsibleSection title="SEO">
                <GlassInput placeholder="Title" value={page.seo?.title || ''} onChange={(e) => updatePage({ seo: { ...page.seo, title: e.target.value } })} className="w-full mb-1" />
                <GlassTextarea placeholder="Description" value={page.seo?.description || ''} onChange={(e) => updatePage({ seo: { ...page.seo, description: e.target.value } })} className="w-full mb-1" rows={2} />
                <GlassInput placeholder="OG image URL" value={page.seo?.ogImage || ''} onChange={(e) => updatePage({ seo: { ...page.seo, ogImage: e.target.value } })} className="w-full" />
              </CollapsibleSection>

              <CollapsibleSection title="Analytics snippets">
                <GlassTextarea placeholder="Head snippet" value={page.analytics?.headSnippet || ''} onChange={(e) => updatePage({ analytics: { ...page.analytics, headSnippet: e.target.value } })} className="w-full mb-1" rows={2} />
                <GlassTextarea placeholder="Body snippet" value={page.analytics?.bodySnippet || ''} onChange={(e) => updatePage({ analytics: { ...page.analytics, bodySnippet: e.target.value } })} className="w-full" rows={2} />
              </CollapsibleSection>

              {!isFullCode && !selected && (
                <p className="text-[11px] text-zinc-600 px-1 mt-2 leading-relaxed">
                  Select a block on the left (or click one on the canvas) to edit its content and design.
                </p>
              )}
            </>
          )}
        </GlassPanel>
      </div>

      {pasteInOpen && <PasteInModal onClose={() => setPasteInOpen(false)} onImport={importPastedBlocks} />}
      {catalogOpen && <BlockCatalogPicker onClose={() => setCatalogOpen(false)} onInsert={insertCatalogBlock} />}

      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-white/15 bg-zinc-900/95 backdrop-blur px-4 py-2.5 shadow-xl">
          <span className="text-sm text-zinc-200">{undoToast.label}</span>
          <button
            onClick={() => undoRef.current?.()}
            className="text-sm font-medium text-glass-sky hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
