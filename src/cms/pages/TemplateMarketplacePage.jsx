import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTemplates, getTemplateInstalls, restoreBackup, saveSiteAsTemplate } from '../lib/api.js';
import TemplatePreviewFrame from '../lib/templates/TemplatePreviewFrame.jsx';
import { GlassPanel, GlassButton, Badge } from '../lib/ui/Glass.jsx';
import { useMe, useIsSuperAdmin } from '../lib/useMe.jsx';

// The template marketplace: browse installable starter sites by category, or
// review this workspace's install history ("My Templates"). Installing is
// done from the detail page (TemplateDetailPage) -- it's destructive (whole-
// site replace, auto-backed-up) so it gets its own confirm surface.
export default function TemplateMarketplacePage() {
  const { orgSlug } = useParams();
  const { me } = useMe();
  const isSuperAdmin = useIsSuperAdmin();
  const isAdmin = me?.org?.role === 'admin';
  const [tab, setTab] = useState('browse');
  const [templates, setTemplates] = useState(null);
  const [category, setCategory] = useState('All');
  const [installs, setInstalls] = useState(null);
  const [error, setError] = useState('');
  const [busyBackup, setBusyBackup] = useState('');

  useEffect(() => {
    getTemplates().then((d) => setTemplates(d.templates)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (tab === 'mine' && installs === null) {
      getTemplateInstalls().then((d) => setInstalls(d.installs)).catch((e) => setError(e.message));
    }
  }, [tab, installs]);

  const categories = useMemo(() => {
    if (!templates) return ['All'];
    return ['All', ...Array.from(new Set(templates.map((t) => t.category)))];
  }, [templates]);

  const visible = useMemo(() => {
    if (!templates) return [];
    return category === 'All' ? templates : templates.filter((t) => t.category === category);
  }, [templates, category]);

  const onCaptureSite = async () => {
    const name = window.prompt('Name this template (captures the current workspace’s site as a new platform template):');
    if (!name?.trim()) return;
    const category = window.prompt('Category?', 'Business') || 'Business';
    try {
      const res = await saveSiteAsTemplate({ name: name.trim(), category: category.trim(), description: '' });
      await getTemplates().then((d) => setTemplates(d.templates));
      alert(`Saved “${res.template.name}” to the marketplace.`);
    } catch (e) {
      alert(e.message);
    }
  };

  const onRestore = async (install) => {
    if (!confirm(`Restore the site you had before installing “${install.templateName}”? Your current site will be backed up first, then replaced.`)) return;
    setBusyBackup(install.backupId);
    try {
      const res = await restoreBackup(install.backupId);
      alert(`Restored ${res.pageCount} page(s). Reload the editor to see them.`);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyBackup('');
    }
  };

  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <div className="flex gap-2">
          {isSuperAdmin && (
            <GlassButton variant="secondary" onClick={onCaptureSite}>Save this site as template</GlassButton>
          )}
          <GlassButton variant={tab === 'browse' ? 'primary' : 'ghost'} onClick={() => setTab('browse')}>Browse</GlassButton>
          <GlassButton variant={tab === 'mine' ? 'primary' : 'ghost'} onClick={() => setTab('mine')}>My Templates</GlassButton>
        </div>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Install a ready-made starter site. Installing replaces your current pages{isAdmin ? '' : ' (admins only)'} — a backup is always saved first, so you can roll back any time.
      </p>

      {tab === 'browse' && (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-xl text-sm transition ${category === c ? 'bg-white/15 text-white border border-white/20' : 'text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent'}`}
              >
                {c}
              </button>
            ))}
          </div>

          {!templates ? (
            <p className="text-zinc-400">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-zinc-400">No templates in this category yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((t) => (
                <GlassPanel key={t.id} className="overflow-hidden flex flex-col">
                  <TemplatePreviewFrame sections={t.previewSections} theme={t.theme} fullHtml={t.previewFullHtml} height={180} />
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-zinc-100">{t.name}</div>
                      <Badge>{t.category}</Badge>
                    </div>
                    <div className="text-xs text-zinc-400 flex-1">{t.description}</div>
                    <div className="text-[11px] text-zinc-500">
                      {t.summary.pageCount} pages · {t.summary.blockTypes.length} block types
                    </div>
                    <Link to={`/${orgSlug}/templates/${t.id}`}>
                      <GlassButton variant="secondary" className="w-full mt-1">View template</GlassButton>
                    </Link>
                  </div>
                </GlassPanel>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mine' && (
        !installs ? (
          <p className="text-zinc-400">Loading…</p>
        ) : installs.length === 0 ? (
          <GlassPanel className="p-6 text-sm text-zinc-400">
            You haven’t installed any templates yet. Browse the marketplace to get started.
          </GlassPanel>
        ) : (
          <div className="flex flex-col gap-3">
            {installs.map((inst) => (
              <GlassPanel key={inst.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium text-zinc-100">{inst.templateName}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Installed {new Date(inst.installedAt).toLocaleString()}
                    {inst.installedBy ? ` by ${inst.installedBy}` : ''}
                    {inst.appliedTheme ? ' · theme applied' : ''}
                  </div>
                </div>
                {isAdmin && inst.backupAvailable ? (
                  <GlassButton
                    variant="secondary"
                    disabled={busyBackup === inst.backupId}
                    onClick={() => onRestore(inst)}
                  >
                    {busyBackup === inst.backupId ? 'Restoring…' : 'Restore previous site'}
                  </GlassButton>
                ) : (
                  <span className="text-xs text-zinc-600">{inst.backupAvailable ? 'Admins only' : 'Backup expired'}</span>
                )}
              </GlassPanel>
            ))}
          </div>
        )
      )}
    </div>
  );
}
