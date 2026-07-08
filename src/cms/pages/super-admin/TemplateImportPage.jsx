import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { segmentHtml } from '../../lib/pasteIn/segmentHtml.js';
import { createTemplate } from '../../lib/api.js';
import TemplatePreviewFrame from '../../lib/templates/TemplatePreviewFrame.jsx';
import { labelForBlock } from '../../lib/templates/blockLabels.js';
import { THEME_PRESETS } from '../../../shared/themePresets.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect } from '../../lib/ui/Glass.jsx';

// Bulk-import a folder of .html files into the marketplace. Each file is
// rendered + segmented into blocks (segmentHtml -> segment.js) and becomes
// its own single-page platform template. Original CSS is intentionally
// dropped -- segmentation captures text/images/links into block fields and
// re-skins them in the workspace theme (see blockRenderers.js); imported
// templates default to a clean theme the author can change afterward.
const CATEGORIES = ['Business', 'Portfolio', 'Food', 'Services', 'Blog', 'Events', 'Nonprofit'];
// Segmentation discards source styling, so imports need a starting theme.
const IMPORT_THEME = THEME_PRESETS[0].theme; // Modern Minimal

const prettyName = (fileName) =>
  fileName.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

export default function TemplateImportPage() {
  const [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const filesRef = useRef(null);
  const folderRef = useRef(null);

  const onFiles = async (fileList) => {
    const files = [...fileList].filter((f) => /\.html?$/i.test(f.name) || f.type === 'text/html');
    if (files.length === 0) return;
    setResults(null);
    setProcessing(true);
    const acc = [];
    for (const f of files) {
      let title = '';
      try { title = new DOMParser().parseFromString(await f.text(), 'text/html').title?.trim() || ''; } catch { /* ignore */ }
      const base = { id: `${f.name}-${Math.random().toString(36).slice(2)}`, fileName: f.name, name: title || prettyName(f.name), category: 'Business' };
      try {
        const { sections, warnings } = await segmentHtml(await f.text());
        acc.push({ ...base, sections, warnings, include: sections.length > 0, error: '' });
      } catch (e) {
        acc.push({ ...base, sections: [], warnings: [], include: false, error: e.message });
      }
      setItems([...acc]); // progressive: show each file as it finishes
    }
    setProcessing(false);
  };

  const patch = (id, p) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const doImport = async () => {
    const chosen = items.filter((it) => it.include && it.sections.length > 0);
    if (chosen.length === 0) return;
    setImporting(true);
    const res = [];
    for (const it of chosen) {
      try {
        const payload = {
          theme: IMPORT_THEME,
          pages: [{ name: 'Home', slug: 'index', sections: it.sections.map((s) => ({ name: s.name, blockType: s.blockType, fields: s.fields })) }],
        };
        const { template } = await createTemplate({ name: it.name, category: it.category, description: '', featureList: [], payload });
        res.push({ name: it.name, ok: true, pages: template.payload?.pages?.length ?? 1 });
      } catch (e) {
        res.push({ name: it.name, ok: false, error: e.message });
      }
      setResults([...res]);
    }
    setImporting(false);
  };

  const chosenCount = items.filter((it) => it.include && it.sections.length > 0).length;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Import HTML templates</h1>
        <Link to="/super-admin/templates" className="text-sm text-glass-sky hover:underline">← Back to templates</Link>
      </div>
      <p className="text-sm text-zinc-400 mb-5">
        Select a folder of <code className="text-zinc-300">.html</code> files. Each file is segmented into editable
        Nexus blocks and becomes its own marketplace template. The original page CSS isn’t kept — content is re-skinned
        to the theme, and any relative image paths will need fixing after import.
      </p>

      <GlassPanel className="p-5 mb-6 flex flex-wrap items-center gap-4">
        <input ref={filesRef} type="file" multiple accept=".html,.htm,text/html" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        {/* webkitdirectory lets the picker select a whole folder at once. */}
        <input ref={folderRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} {...{ webkitdirectory: '', directory: '' }} />
        <GlassButton variant="secondary" onClick={() => filesRef.current?.click()}>Choose .html files…</GlassButton>
        <GlassButton variant="secondary" onClick={() => folderRef.current?.click()}>Choose a folder…</GlassButton>
        {processing && <span className="text-sm text-zinc-400">Rendering &amp; segmenting…</span>}
        {items.length > 0 && !processing && (
          <span className="text-sm text-zinc-400">{items.length} file(s) · {chosenCount} ready to import</span>
        )}
      </GlassPanel>

      {results && (
        <GlassPanel className="p-4 mb-6">
          <div className="text-sm font-medium text-zinc-100 mb-2">
            Imported {results.filter((r) => r.ok).length} / {results.length}
          </div>
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
                  <TemplatePreviewFrame sections={it.sections} theme={IMPORT_THEME} height={150} />
                )}
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={it.include} disabled={!!it.error || it.sections.length === 0} onChange={(e) => patch(it.id, { include: e.target.checked })} className="w-4 h-4" />
                    <GlassInput className="flex-1 text-sm py-1" value={it.name} onChange={(e) => patch(it.id, { name: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <GlassSelect className="text-xs py-1" value={it.category} onChange={(e) => patch(it.id, { category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </GlassSelect>
                    <span className="text-[11px] text-zinc-500">{it.sections.length} blocks</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(it.sections.map((s) => s.blockType))].slice(0, 6).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-zinc-400">{labelForBlock(t)}</span>
                    ))}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">{it.fileName}</div>
                  {it.warnings?.length > 0 && (
                    <div className="text-[11px] text-amber-400/90">⚠ {it.warnings[0].msg}</div>
                  )}
                </div>
              </GlassPanel>
            ))}
          </div>

          <div className="sticky bottom-4 flex justify-end">
            <GlassButton onClick={doImport} disabled={importing || chosenCount === 0}>
              {importing ? 'Importing…' : `Import ${chosenCount} template${chosenCount === 1 ? '' : 's'}`}
            </GlassButton>
          </div>
        </>
      )}
    </div>
  );
}
