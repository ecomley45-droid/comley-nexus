import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Blocks, Code2, Plus, FileText } from 'lucide-react';
import { usePagesStore } from '../lib/usePagesStore.js';
import { getFullPath } from '../../shared/compilePage.js';
import { createPage as createPageAction } from '../lib/pageActions.js';
import { PAGE_MODES, modeOf } from '../lib/pageModes.js';
import { GlassPanel, GlassButton, Badge } from '../lib/ui/Glass.jsx';
import EmptyState from '../lib/ui/EmptyState.jsx';
import { useConfirm } from '../lib/ui/useConfirm.jsx';
import { useOrgBase, useIsAdmin, useIsSuperAdmin } from '../lib/useMe.jsx';
import { getNexusPages, saveNexusPages } from '../lib/api.js';

// `nexus`: when true, this renders Nexus's own site pages (super-admin
// only, /super-admin/pages) instead of the signed-in org's pages. Same UI,
// different backing store — see usePagesStore's fetch/save overrides.
export default function PagesListPage({ nexus = false }) {
  const { pages, setPages, loading, error, save, saving } = usePagesStore(
    nexus ? { fetchPages: getNexusPages, savePages: saveNexusPages } : undefined
  );
  const navigate = useNavigate();
  const orgBase = useOrgBase();
  const isAdmin = useIsAdmin();
  const isSuperAdmin = useIsSuperAdmin();
  const base = nexus ? '/super-admin' : (orgBase || '/admin');
  const [choosingMode, setChoosingMode] = useState(false);
  const [confirm, confirmUi] = useConfirm();

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  // Full-code pages need admin to save (see pagesContainFullHtmlMode on the
  // server), so don't offer creating one to an editor who couldn't keep it.
  const canUseFullCode = nexus ? isSuperAdmin : isAdmin;

  const createPage = (mode) => {
    setChoosingMode(false);
    return createPageAction(pages, setPages, save, navigate, base, mode);
  };

  const deletePage = async (page) => {
    const children = pages.filter((p) => p.parentId === page.id).length;
    const ok = await confirm({
      title: `Delete “${page.name}”?`,
      body: children > 0
        ? `Its ${children} child page${children === 1 ? '' : 's'} will be left without a parent, changing their addresses. This can't be undone.`
        : `The page and its blocks are removed. Anyone visiting /${getFullPath(page, pages)} will get a 404. This can't be undone.`,
      confirmLabel: 'Delete page',
    });
    if (!ok) return;
    const nextPages = pages.filter((p) => p.id !== page.id);
    setPages(nextPages);
    await save(nextPages);
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-4 gap-3">
        <h1 className="text-2xl font-semibold">Pages</h1>
        <div className="relative">
          <GlassButton onClick={() => setChoosingMode(!choosingMode)} disabled={saving}>
            <Plus size={14} /> New page
          </GlassButton>
          {choosingMode && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setChoosingMode(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-80 rounded-2xl border border-white/15 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 px-2 pt-1 pb-2">How do you want to build it?</p>
                {[
                  { mode: 'blocks', icon: Blocks },
                  { mode: 'full-html', icon: Code2 },
                ].map(({ mode, icon: Icon }) => {
                  const blocked = mode === 'full-html' && !canUseFullCode;
                  return (
                    <button
                      key={mode}
                      onClick={() => createPage(mode)}
                      disabled={blocked}
                      className="w-full text-left flex gap-2.5 p-2.5 rounded-xl hover:bg-white/[0.07] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition"
                    >
                      <Icon size={16} className="text-zinc-400 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm text-zinc-100">{PAGE_MODES[mode].label}</span>
                        <span className="block text-[11px] text-zinc-500 leading-relaxed">
                          {blocked ? 'Only workspace admins can create full-code pages.' : PAGE_MODES[mode].description}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <p className="text-[11px] text-zinc-600 px-2.5 pt-1.5 pb-1 leading-relaxed">
                  You can switch later — converting makes a separate draft copy and leaves the original alone.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No pages yet"
          action={{ label: 'Create your first page', icon: Plus, onClick: () => setChoosingMode(true) }}
          secondary={{ label: 'Start from a template', to: `${base}/templates` }}
        >
          Pages are what visitors see. Build one from blocks, or install a whole starter
          site from a template and edit it.
        </EmptyState>
      ) : (
      <GlassPanel className="p-2 overflow-x-auto">
        <table className="w-full min-w-lg text-sm border-collapse">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Name</th>
              <th className="font-normal">Path</th>
              <th className="font-normal">Built with</th>
              <th className="font-normal">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              const mode = modeOf(page);
              return (
                <tr key={page.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 px-2">
                    <Link to={`${base}/pages/${page.id}`} className="text-zinc-100 hover:text-glass-sky">{page.name}</Link>
                  </td>
                  <td className="text-zinc-500">/{getFullPath(page, pages)}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                      {mode === 'full-html' ? <Code2 size={12} /> : <Blocks size={12} />}
                      {PAGE_MODES[mode].label}
                    </span>
                  </td>
                  <td>
                    <Badge tone={page.status === 'published' ? 'published' : 'draft'}>{page.status}</Badge>
                  </td>
                  <td className="text-right px-2">
                    <button onClick={() => deletePage(page)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassPanel>
      )}
      {confirmUi}
    </div>
  );
}
