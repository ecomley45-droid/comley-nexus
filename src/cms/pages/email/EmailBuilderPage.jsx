import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getEmailBlocks, previewEmail, saveEmailTemplate, saveEmailCampaign, getEmailTemplate } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput } from '../../lib/ui/Glass.jsx';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import BlockFields from './BlockFields.jsx';

const clientId = (p) => `${p}_${Math.random().toString(16).slice(2, 12)}`;
const blankDoc = () => ({ settings: { backgroundColor: '#f4f4f7', contentBackground: '#ffffff', width: 600, fontFamily: 'Arial, Helvetica, sans-serif', textColor: '#333333', linkColor: '#2563eb', preheader: '' }, rows: [] });

// Block-based email editor: a stack of rows (each 1–2 columns of blocks) with
// a live MJML preview compiled server-side, so what you see is what sends.
export default function EmailBuilderPage() {
  const { orgSlug } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [doc, setDoc] = useState(() => location.state?.document || blankDoc());
  const [palette, setPalette] = useState({ blocks: [], defaults: {} });
  const [selected, setSelected] = useState(null); // "r-c-b"
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // If arriving with a template id and no state doc, load it.
  useEffect(() => {
    const id = location.state?.templateId;
    if (id && !location.state?.document) getEmailTemplate(id).then((t) => setDoc(t.document)).catch(() => {});
  }, [location.state]);

  useEffect(() => { getEmailBlocks().then(setPalette).catch(() => {}); }, []);

  // Debounced live preview.
  const debounced = useDebouncedValue(doc, 400);
  useEffect(() => {
    let alive = true;
    previewEmail(debounced).then((r) => { if (alive) setHtml(r.html); }).catch(() => {});
    return () => { alive = false; };
  }, [debounced]);

  // ---- immutable doc helpers ----
  const mutateRows = (fn) => setDoc((d) => ({ ...d, rows: fn(structuredClone(d.rows)) }));
  const updateBlock = (r, c, b, patch) => mutateRows((rows) => { Object.assign(rows[r].columns[c].blocks[b], patch); return rows; });
  const deleteBlock = (r, c, b) => { mutateRows((rows) => { rows[r].columns[c].blocks.splice(b, 1); return rows; }); setSelected(null); };
  const moveBlock = (r, c, b, dir) => mutateRows((rows) => { const col = rows[r].columns[c].blocks; const j = b + dir; if (j < 0 || j >= col.length) return rows; [col[b], col[j]] = [col[j], col[b]]; return rows; });
  const addBlock = (r, c, type) => mutateRows((rows) => { rows[r].columns[c].blocks.push({ id: clientId('blk'), type, ...structuredClone(palette.defaults[type] || {}) }); return rows; });
  const addRow = (cols) => mutateRows((rows) => { rows.push({ id: clientId('row'), backgroundColor: '', columns: Array.from({ length: cols }, () => ({ blocks: [] })) }); return rows; });
  const moveRow = (r, dir) => mutateRows((rows) => { const j = r + dir; if (j < 0 || j >= rows.length) return rows; [rows[r], rows[j]] = [rows[j], rows[r]]; return rows; });
  const deleteRow = (r) => { mutateRows((rows) => { rows.splice(r, 1); return rows; }); setSelected(null); };

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const saveTemplate = async () => {
    const name = prompt('Template name?', 'My template');
    if (!name) return;
    setSaving(true);
    try { await saveEmailTemplate({ name, document: doc }); flash('Template saved'); }
    catch (e) { flash(e.message); } finally { setSaving(false); }
  };

  const useInCampaign = async () => {
    setSaving(true);
    try {
      const c = await saveEmailCampaign({ name: 'New campaign', document: doc, subject: '' });
      nav(`/${orgSlug}/email/campaigns/${c.id}`);
    } catch (e) { flash(e.message); } finally { setSaving(false); }
  };

  const blockTypes = palette.blocks.length ? palette.blocks : [];

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Editor column */}
      <div className="w-[46%] overflow-y-auto pr-1">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold">Email builder</h1>
          <div className="flex gap-2">
            <GlassButton variant="secondary" onClick={saveTemplate} disabled={saving}>Save template</GlassButton>
            <GlassButton onClick={useInCampaign} disabled={saving || !doc.rows.length}>Use in campaign →</GlassButton>
          </div>
        </div>
        {toast && <div className="mb-3 text-sm rounded-lg bg-emerald-400/10 border border-emerald-400/30 px-3 py-1.5 text-emerald-200">{toast}</div>}

        {/* Settings */}
        <GlassPanel className="p-3 mb-3">
          <div className="flex gap-3 flex-wrap items-end">
            <label className="text-xs text-zinc-400">Preheader
              <GlassInput className="block mt-1 w-64" value={doc.settings.preheader} onChange={(e) => setDoc((d) => ({ ...d, settings: { ...d.settings, preheader: e.target.value } }))} placeholder="Inbox preview text" />
            </label>
            <label className="text-xs text-zinc-400">Background
              <GlassInput type="color" className="block mt-1 h-9 w-14 p-1" value={doc.settings.backgroundColor} onChange={(e) => setDoc((d) => ({ ...d, settings: { ...d.settings, backgroundColor: e.target.value } }))} />
            </label>
          </div>
        </GlassPanel>

        {/* Rows */}
        {doc.rows.map((row, r) => (
          <GlassPanel key={row.id} className="p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Row {r + 1} · {row.columns.length} col</span>
              <div className="flex gap-1 text-xs">
                <button className="px-1.5 text-zinc-400 hover:text-white" onClick={() => moveRow(r, -1)}>↑</button>
                <button className="px-1.5 text-zinc-400 hover:text-white" onClick={() => moveRow(r, 1)}>↓</button>
                <button className="px-1.5 text-zinc-400 hover:text-red-300" onClick={() => deleteRow(r)}>Delete</button>
              </div>
            </div>
            <div className="flex gap-2">
              {row.columns.map((col, c) => (
                <div key={c} className="flex-1 min-w-0 border border-white/10 rounded-lg p-2">
                  {col.blocks.map((blk, b) => {
                    const key = `${r}-${c}-${b}`;
                    const open = selected === key;
                    return (
                      <div key={blk.id} className="mb-2 rounded-md bg-white/[0.04] border border-white/10">
                        <div className="flex items-center justify-between px-2 py-1.5">
                          <button className="text-sm text-zinc-200 capitalize" onClick={() => setSelected(open ? null : key)}>{blk.type}</button>
                          <div className="flex gap-1 text-xs text-zinc-500">
                            <button className="hover:text-white" onClick={() => moveBlock(r, c, b, -1)}>↑</button>
                            <button className="hover:text-white" onClick={() => moveBlock(r, c, b, 1)}>↓</button>
                            <button className="hover:text-red-300" onClick={() => deleteBlock(r, c, b)}>✕</button>
                          </div>
                        </div>
                        {open && <div className="px-2 pb-2 pt-1 border-t border-white/10"><BlockFields block={blk} onChange={(patch) => updateBlock(r, c, b, patch)} /></div>}
                      </div>
                    );
                  })}
                  <select className="w-full text-xs bg-white/[0.06] border border-white/15 rounded-md px-2 py-1.5 text-zinc-300" value="" onChange={(e) => e.target.value && addBlock(r, c, e.target.value)}>
                    <option value="">+ add block…</option>
                    {blockTypes.map((bt) => <option key={bt.type} value={bt.type}>{bt.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </GlassPanel>
        ))}

        <div className="flex gap-2">
          <GlassButton variant="secondary" onClick={() => addRow(1)}>+ Row (1 col)</GlassButton>
          <GlassButton variant="secondary" onClick={() => addRow(2)}>+ Row (2 col)</GlassButton>
        </div>
      </div>

      {/* Live preview */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-500 mb-2">Live preview (compiled MJML — matches the inbox)</div>
        <iframe title="Email preview" srcDoc={html} className="w-full h-full rounded-xl border border-white/10 bg-white" />
      </div>
    </div>
  );
}
