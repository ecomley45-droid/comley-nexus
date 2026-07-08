import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTemplate, installTemplate } from '../lib/api.js';
import TemplatePreviewFrame from '../lib/templates/TemplatePreviewFrame.jsx';
import { labelForBlock } from '../lib/templates/blockLabels.js';
import { GlassPanel, GlassButton, Badge } from '../lib/ui/Glass.jsx';
import { useMe } from '../lib/useMe.jsx';

// One template's detail page: description, authored feature list, the DERIVED
// list of blocks it uses, a per-page live preview, and the Install action.
// Install replaces the whole site (auto-backed-up first) and is admin-only.
export default function TemplateDetailPage() {
  const { orgSlug, id } = useParams();
  const { me } = useMe();
  const isAdmin = me?.org?.role === 'admin';

  const [template, setTemplate] = useState(null);
  const [error, setError] = useState('');
  const [activePage, setActivePage] = useState(0);
  const [applyTheme, setApplyTheme] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    getTemplate(id).then((d) => setTemplate(d.template)).catch((e) => setError(e.message));
  }, [id]);

  const pages = template?.payload?.pages || [];
  const theme = template?.payload?.theme || {};

  // Derive "blocks included" (type + count) from the payload. Depends on
  // `template` (stable across renders) rather than the freshly-derived
  // `pages` array.
  const blockCounts = useMemo(() => {
    const counts = {};
    for (const p of (template?.payload?.pages || [])) {
      for (const s of (p.sections || [])) counts[s.blockType] = (counts[s.blockType] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [template]);

  const onInstall = async () => {
    if (!confirm(
      `Install “${template.name}”?\n\nThis replaces your current site with ${pages.length} page(s)`
      + `${applyTheme ? ' and applies the template theme' : ''}. A backup of your current site will be saved first, so you can undo this from My Templates.`
    )) return;
    setInstalling(true);
    try {
      const res = await installTemplate(id, applyTheme);
      setDone(res);
    } catch (e) {
      alert(e.message);
    } finally {
      setInstalling(false);
    }
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!template) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-6xl">
      <Link to={`/${orgSlug}/templates`} className="text-sm text-glass-sky hover:underline">← All templates</Link>

      <div className="flex items-start justify-between gap-4 mt-2 mb-1 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">{template.name} <Badge>{template.category}</Badge></h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">{template.description}</p>
        </div>
      </div>

      {done ? (
        <GlassPanel className="p-5 my-4 border-emerald-400/30">
          <div className="text-emerald-300 font-medium">Template installed 🎉</div>
          <div className="text-sm text-zinc-300 mt-1">
            {done.pageCount} page(s) added{done.appliedTheme ? ', theme applied' : ''}. Your previous site was backed up.
          </div>
          <div className="flex gap-2 mt-3">
            <Link to={`/${orgSlug}/pages`}><GlassButton>Open Pages</GlassButton></Link>
            <Link to={`/${orgSlug}/templates`}><GlassButton variant="secondary">My Templates (undo)</GlassButton></Link>
          </div>
        </GlassPanel>
      ) : (
        <GlassPanel className="p-4 my-4 flex items-center justify-between gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-zinc-300 select-none">
            <input type="checkbox" checked={applyTheme} onChange={(e) => setApplyTheme(e.target.checked)} />
            Apply this template’s colors &amp; fonts
          </label>
          {isAdmin ? (
            <GlassButton onClick={onInstall} disabled={installing}>
              {installing ? 'Installing…' : 'Install to my workspace'}
            </GlassButton>
          ) : (
            <span className="text-xs text-zinc-500">Only workspace admins can install a template.</span>
          )}
        </GlassPanel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {pages.map((p, i) => (
              <button
                key={p.slug || i}
                onClick={() => setActivePage(i)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${activePage === i ? 'bg-white/15 text-white border border-white/20' : 'text-zinc-300 hover:bg-white/10 border border-transparent'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <GlassPanel className="overflow-hidden">
            <div className="max-h-[75vh] overflow-y-auto">
              <TemplatePreviewFrame
                sections={pages[activePage]?.sections || []}
                fullHtml={pages[activePage]?.editorMode === 'full-html' ? pages[activePage].fullHtml : null}
                theme={theme}
                height={560}
                autoHeight
                interactive
              />
            </div>
          </GlassPanel>
          <p className="text-xs text-zinc-500 mt-2">
            Full-page desktop (1440px) preview with the template’s theme, scaled to fit — this is exactly what installs.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {template.featureList?.length > 0 && (
            <GlassPanel className="p-4">
              <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">What’s included</h2>
              <ul className="text-sm text-zinc-300 flex flex-col gap-1.5">
                {template.featureList.map((f, i) => (
                  <li key={i} className="flex gap-2"><span className="text-emerald-400">✓</span>{f}</li>
                ))}
              </ul>
            </GlassPanel>
          )}

          <GlassPanel className="p-4">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
              {template.summary?.fullHtmlPages > 0 && blockCounts.length === 0 ? 'Format' : 'Blocks used'}
            </h2>
            {template.summary?.fullHtmlPages > 0 && blockCounts.length === 0 ? (
              <p className="text-sm text-zinc-300">
                Original HTML design — installs pixel-for-pixel from the source, edited as raw HTML rather than blocks.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {blockCounts.map(([type, count]) => (
                  <span key={type} className="text-xs px-2 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-zinc-300">
                    {labelForBlock(type)}{count > 1 ? ` ×${count}` : ''}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] text-zinc-500 mt-3">
              {template.summary?.pageCount} pages · {template.summary?.sectionCount} sections
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
