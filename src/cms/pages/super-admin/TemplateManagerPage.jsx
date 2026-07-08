import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from '../../lib/api.js';
import TemplatePreviewFrame from '../../lib/templates/TemplatePreviewFrame.jsx';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect, Badge } from '../../lib/ui/Glass.jsx';

// Super-Admin authoring for the marketplace: create / edit / delete the
// platform-wide starter templates every workspace sees. A template's site
// definition is a JSON payload ({ pages:[{ name, slug, sections:[{ name,
// blockType, fields }] }], theme:{...} }); it's validated server-side on
// save (unknown/unsafe blocks dropped -- see lib/sitePayload.js), and
// previewed live here through the same renderers an install uses.
const CATEGORIES = ['Business', 'Portfolio', 'Food', 'Services', 'Blog', 'Events', 'Nonprofit'];

const SKELETON = `{
  "theme": { "primary": "#6366f1", "bg": "#070a13", "text": "#e2e8f0", "accent": "#6366f1", "link": "#a5b4fc", "muted": "#a1a1aa", "fontFamily": "system", "fontScale": "comfortable" },
  "pages": [
    {
      "name": "Home", "slug": "index",
      "sections": [
        { "name": "Header", "blockType": "header", "fields": { "headings": ["Brand"], "links": [{ "href": "/", "label": "Home" }, { "href": "/contact", "label": "Contact" }] } },
        { "name": "Hero", "blockType": "hero", "fields": { "headings": ["A bold headline"], "text": ["One or two supporting sentences."], "links": [{ "href": "/contact", "label": "Get started" }] } },
        { "name": "Footer", "blockType": "footer", "fields": { "text": ["© 2026 Brand."], "links": [{ "href": "/contact", "label": "Contact" }] } }
      ]
    }
  ]
}`;

const emptyDraft = () => ({
  id: null, name: '', slug: '', category: 'Business', description: '',
  featuresText: '', payloadText: SKELETON,
});

function parsePayload(text) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || !Array.isArray(value.pages)) {
      return { error: 'Payload must be an object with a "pages" array.' };
    }
    return { value };
  } catch (e) {
    return { error: `Invalid JSON: ${e.message}` };
  }
}

export default function TemplateManagerPage() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // null = list view; object = editing
  const [saving, setSaving] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);

  const refresh = () => getTemplates().then((d) => setTemplates(d.templates)).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const parsed = useMemo(() => (draft ? parsePayload(draft.payloadText) : null), [draft]);
  const previewPages = parsed?.value?.pages || [];
  const previewTheme = parsed?.value?.theme || {};

  const startNew = () => { setDraft(emptyDraft()); setPreviewPage(0); };

  const startEdit = async (id) => {
    setError('');
    try {
      const { template } = await getTemplate(id);
      setDraft({
        id: template.id, name: template.name, slug: template.slug,
        category: template.category, description: template.description,
        featuresText: (template.featureList || []).join('\n'),
        payloadText: JSON.stringify(template.payload, null, 2),
      });
      setPreviewPage(0);
    } catch (e) { setError(e.message); }
  };

  const save = async () => {
    const p = parsePayload(draft.payloadText);
    if (p.error) { alert(p.error); return; }
    if (!draft.name.trim()) { alert('Name is required.'); return; }
    const body = {
      name: draft.name.trim(), slug: draft.slug.trim() || undefined,
      category: draft.category, description: draft.description,
      featureList: draft.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
      payload: p.value,
    };
    setSaving(true);
    try {
      if (draft.id) await updateTemplate(draft.id, body);
      else await createTemplate(body);
      setDraft(null);
      await refresh();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async (t) => {
    if (!confirm(`Delete template “${t.name}”? Workspaces that already installed it keep their pages.`)) return;
    try { await deleteTemplate(t.id); await refresh(); } catch (e) { alert(e.message); }
  };

  if (error) return <p className="text-red-400">{error}</p>;

  // ---- Editor view ----
  if (draft) {
    return (
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">{draft.id ? 'Edit template' : 'New template'}</h1>
          <div className="flex gap-2">
            <GlassButton variant="ghost" onClick={() => setDraft(null)}>Cancel</GlassButton>
            <GlassButton onClick={save} disabled={saving || !!parsed?.error}>{saving ? 'Saving…' : 'Save template'}</GlassButton>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Name</label>
              <GlassInput className="w-full" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Agency / Studio" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Category</label>
                <GlassSelect className="w-full" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </GlassSelect>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Slug (optional)</label>
                <GlassInput className="w-full" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="agency" />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Description</label>
              <GlassInput className="w-full" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="One-line pitch shown on the card." />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Feature list (one per line)</label>
              <GlassTextarea className="w-full h-24" value={draft.featuresText} onChange={(e) => setDraft({ ...draft, featuresText: e.target.value })} placeholder={'Services, work & contact pages\nTestimonials section'} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Payload (JSON)</label>
              <GlassTextarea className="w-full h-80" value={draft.payloadText} onChange={(e) => setDraft({ ...draft, payloadText: e.target.value })} spellCheck={false} />
              {parsed?.error
                ? <p className="text-xs text-red-400 mt-1">{parsed.error}</p>
                : <p className="text-xs text-emerald-400/80 mt-1">Valid · {previewPages.length} page(s). Unknown/unsafe blocks are dropped on save.</p>}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {previewPages.map((p, i) => (
                <button key={p.slug || i} onClick={() => setPreviewPage(i)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition ${previewPage === i ? 'bg-white/15 text-white border border-white/20' : 'text-zinc-300 hover:bg-white/10 border border-transparent'}`}>
                  {p.name || p.slug || `Page ${i + 1}`}
                </button>
              ))}
            </div>
            <GlassPanel className="overflow-hidden sticky top-6">
              <div className="max-h-[70vh] overflow-y-auto">
                <TemplatePreviewFrame sections={previewPages[previewPage]?.sections || []} theme={previewTheme} height={480} autoHeight />
              </div>
            </GlassPanel>
            <p className="text-xs text-zinc-500 mt-2">Live desktop preview of the payload, exactly as it will install.</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- List view ----
  const platform = (templates || []).filter((t) => t.scope === 'platform');
  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <div className="flex gap-2">
          <Link to="/super-admin/templates/import"><GlassButton variant="secondary">Import HTML files</GlassButton></Link>
          <GlassButton onClick={startNew}>New template</GlassButton>
        </div>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Platform starter sites every workspace can install. Edits here don’t affect sites already installed — those are independent copies.
      </p>

      {!templates ? (
        <p className="text-zinc-400">Loading…</p>
      ) : platform.length === 0 ? (
        <GlassPanel className="p-6 text-sm text-zinc-400">No templates yet. Click “New template” to author one.</GlassPanel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platform.map((t) => (
            <GlassPanel key={t.id} className="overflow-hidden flex flex-col">
              <TemplatePreviewFrame sections={t.previewSections} theme={t.theme} height={150} />
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-zinc-100">{t.name}</div>
                  <Badge>{t.category}</Badge>
                </div>
                <div className="text-xs text-zinc-400 flex-1">{t.description}</div>
                <div className="text-[11px] text-zinc-500">{t.summary.pageCount} pages · {t.summary.blockTypes.length} block types</div>
                <div className="flex gap-3 mt-1">
                  <button onClick={() => startEdit(t.id)} className="text-xs text-glass-sky hover:underline">Edit</button>
                  <button onClick={() => remove(t)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
