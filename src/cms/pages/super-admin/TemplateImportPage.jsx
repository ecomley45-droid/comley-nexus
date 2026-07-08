import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { segmentHtml } from '../../lib/pasteIn/segmentHtml.js';
import { createTemplate } from '../../lib/api.js';
import TemplatePreviewFrame from '../../lib/templates/TemplatePreviewFrame.jsx';
import { labelForBlock } from '../../lib/templates/blockLabels.js';
import { THEME_PRESETS } from '../../../shared/themePresets.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect, Badge } from '../../lib/ui/Glass.jsx';

// Bulk-import a folder of .html files into the marketplace, one template per
// file. Two modes:
//   - design (default): keep each file's original HTML+CSS verbatim as a
//     Full-HTML template page -- installs pixel-for-pixel, edited as raw HTML.
//   - blocks: segment each file into editable Nexus blocks (segment.js);
//     original CSS is dropped and content is re-skinned to a theme.
const CATEGORIES = ['Business', 'Portfolio', 'Food', 'Services', 'Blog', 'Events', 'Nonprofit'];
const BLOCKS_THEME = THEME_PRESETS[0].theme; // Modern Minimal -- only used in blocks mode

const prettyName = (fileName) =>
  fileName.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

export default function TemplateImportPage() {
  const [mode, setMode] = useState('design');
  const [files, setFiles] = useState([]); // raw File objects, reprocessed on mode change
  const [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const filesRef = useRef(null);
  const folderRef = useRef(null);

  const onFiles = (fileList) => {
    const picked = [...fileList].filter((f) => /\.html?$/i.test(f.name) || f.type === 'text/html');
    setResults(null);
    setFiles(picked);
  };

  // Reprocess whenever the file set or the mode changes.
  useEffect(() => {
    let cancelled = false;
    if (files.length === 0) { setItems([]); return undefined; }
    (async () => {
      setProcessing(true);
      const acc = [];
      for (const f of files) {
        const text = await f.text();
        let title = '';
        try { title = new DOMParser().parseFromString(text, 'text/html').title?.trim() || ''; } catch { /* ignore */ }
        const base = { id: `${f.name}-${Math.random().toString(36).slice(2)}`, fileName: f.name, name: title || prettyName(f.name), category: 'Business' };
        if (mode === 'design') {
          acc.push({ ...base, fullHtml: text, sections: null, warnings: [], include: true, error: '' });
        } else {
          try {
            const { sections, warnings } = await segmentHtml(text);
            acc.push({ ...base, fullHtml: null, sections, warnings, include: sections.length > 0, error: '' });
          } catch (e) {
            acc.push({ ...base, fullHtml: null, sections: [], warnings: [], include: false, error: e.message });
          }
        }
        if (cancelled) return;
        setItems([...acc]);
      }
      if (!cancelled) setProcessing(false);
    })();
    return () => { cancelled = true; };
  }, [files, mode]);

  const patch = (id, p) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const readyItems = items.filter((it) => it.include && (it.fullHtml || (it.sections && it.sections.length > 0)));

  const doImport = async () => {
    if (readyItems.length === 0) return;
    setImporting(true);
    const res = [];
    for (const it of readyItems) {
      try {
        const page = it.fullHtml
          ? { name: 'Home', slug: 'index', editorMode: 'full-html', fullHtml: it.fullHtml }
          : { name: 'Home', slug: 'index', sections: it.sections.map((s) => ({ name: s.name, blockType: s.blockType, fields: s.fields })) };
        const payload = { theme: it.fullHtml ? {} : BLOCKS_THEME, pages: [page] };
        await createTemplate({ name: it.name, category: it.category, description: '', featureList: [], payload });
        res.push({ name: it.name, ok: true });
      } catch (e) {
        res.push({ name: it.name, ok: false, error: e.message });
      }
      setResults([...res]);
    }
    setImporting(false);
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Import HTML templates</h1>
        <Link to="/super-admin/templates" className="text-sm text-glass-sky hover:underline">← Back to templates</Link>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Select a folder of <code className="text-zinc-300">.html</code> files — each becomes its own marketplace template.
      </p>

      <div className="flex flex-wrap gap-3 items-stretch mb-5">
        <button
          onClick={() => setMode('design')}
          className={`flex-1 min-w-[240px] text-left rounded-xl border p-3 transition ${mode === 'design' ? 'border-glass-indigo bg-white/10' : 'border-white/10 hover:border-white/25'}`}
        >
          <div className="text-sm font-medium text-zinc-100">Keep original design <Badge>recommended</Badge></div>
          <div className="text-xs text-zinc-400 mt-1">Preserves each file’s exact HTML &amp; CSS. Installs pixel-for-pixel; edited as raw HTML, not blocks.</div>
        </button>
        <button
          onClick={() => setMode('blocks')}
          className={`flex-1 min-w-[240px] text-left rounded-xl border p-3 transition ${mode === 'blocks' ? 'border-glass-indigo bg-white/10' : 'border-white/10 hover:border-white/25'}`}
        >
          <div className="text-sm font-medium text-zinc-100">Convert to editable blocks</div>
          <div className="text-xs text-zinc-400 mt-1">Segments each page into Nexus blocks. Fully editable, but original styling is dropped and re-skinned to a theme.</div>
        </button>
      </div>

      <GlassPanel className="p-5 mb-6 flex flex-wrap items-center gap-4">
        <input ref={filesRef} type="file" multiple accept=".html,.htm,text/html" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        {/* webkitdirectory lets the picker select a whole folder at once. */}
        <input ref={folderRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} {...{ webkitdirectory: '', directory: '' }} />
        <GlassButton variant="secondary" onClick={() => filesRef.current?.click()}>Choose .html files…</GlassButton>
        <GlassButton variant="secondary" onClick={() => folderRef.current?.click()}>Choose a folder…</GlassButton>
        {processing && <span className="text-sm text-zinc-400">Processing…</span>}
        {items.length > 0 && !processing && (
          <span className="text-sm text-zinc-400">{items.length} file(s) · {readyItems.length} ready to import</span>
        )}
      </GlassPanel>

      {results && (
        <GlassPanel className="p-4 mb-6">
          <div className="text-sm font-medium text-zinc-100 mb-2">Imported {results.filter((r) => r.ok).length} / {results.length}</div>
          <div className="flex flex-col gap-1 text-xs">
            {results.map((r, i) => (
              <div key={i} className={r.ok ? 'text-emerald-300' : 'text-red-400'}>
                {r.ok ? '✓' : '✕'} {r.name}{r.ok ? '' : ` — ${r.error}`}
              </div>
            ))}
          </div>
          <Link to="/super-admin/templates"><GlassButton className="mt-3">View templates</GlassButton></Link>
        </GlassPanel>
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {items.map((it) => (
              <GlassPanel key={it.id} className={`overflow-hidden flex flex-col ${it.include ? '' : 'opacity-60'}`}>
                {it.error ? (
                  <div className="h-[150px] flex items-center justify-center text-xs text-red-400 px-3 text-center">{it.error}</div>
                ) : (
                  <TemplatePreviewFrame sections={it.sections || []} fullHtml={it.fullHtml} theme={BLOCKS_THEME} height={150} />
                )}
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={it.include} disabled={!!it.error || (!it.fullHtml && (!it.sections || it.sections.length === 0))} onChange={(e) => patch(it.id, { include: e.target.checked })} className="w-4 h-4" />
                    <GlassInput className="flex-1 text-sm py-1" value={it.name} onChange={(e) => patch(it.id, { name: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <GlassSelect className="text-xs py-1" value={it.category} onChange={(e) => patch(it.id, { category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </GlassSelect>
                    <span className="text-[11px] text-zinc-500">{it.fullHtml ? 'Original HTML' : `${it.sections?.length || 0} blocks`}</span>
                  </div>
                  {it.sections && it.sections.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(it.sections.map((s) => s.blockType))].slice(0, 6).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-zinc-400">{labelForBlock(t)}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-zinc-500 truncate">{it.fileName}</div>
                  {it.warnings?.length > 0 && <div className="text-[11px] text-amber-400/90">⚠ {it.warnings[0].msg}</div>}
                </div>
              </GlassPanel>
            ))}
          </div>

          <div className="sticky bottom-4 flex justify-end">
            <GlassButton onClick={doImport} disabled={importing || readyItems.length === 0}>
              {importing ? 'Importing…' : `Import ${readyItems.length} template${readyItems.length === 1 ? '' : 's'}`}
            </GlassButton>
          </div>
        </>
      )}
    </div>
  );
}
