import { Link, useNavigate } from 'react-router-dom';
import { usePagesStore } from '../lib/usePagesStore.js';
import { getFullPath } from '../../shared/compilePage.js';
import { createPage as createPageAction } from '../lib/pageActions.js';
import { GlassPanel, GlassButton, Badge } from '../lib/ui/Glass.jsx';
import { useOrgBase } from '../lib/useMe.jsx';
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
  const base = nexus ? '/super-admin' : (orgBase || '/admin');

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const createPage = () => createPageAction(pages, setPages, save, navigate, base);

  const deletePage = async (id) => {
    if (!confirm('Delete this page?')) return;
    const nextPages = pages.filter((p) => p.id !== id);
    setPages(nextPages);
    await save(nextPages);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Pages</h1>
        <GlassButton onClick={createPage} disabled={saving}>New page</GlassButton>
      </div>

      {pages.length === 0 && <p className="text-zinc-500">No pages yet. Create your first one.</p>}

      <GlassPanel className="p-2">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Name</th>
              <th className="font-normal">Path</th>
              <th className="font-normal">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-2">
                  <Link to={`${base}/pages/${page.id}`} className="text-zinc-100 hover:text-glass-sky">{page.name}</Link>
                </td>
                <td className="text-zinc-500">/{getFullPath(page, pages)}</td>
                <td>
                  <Badge tone={page.status === 'published' ? 'published' : 'draft'}>{page.status}</Badge>
                </td>
                <td className="text-right px-2">
                  <button onClick={() => deletePage(page.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
