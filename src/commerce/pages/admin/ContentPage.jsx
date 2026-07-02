import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPages } from '../../../cms/lib/api.js';
import { getFullPath } from '../../../shared/compilePage.js';
import { GlassPanel, Badge } from '../../../cms/lib/ui/Glass.jsx';

export default function ContentPage() {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPages().then((d) => setPages(d.pages)).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!pages) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Content</h1>
      <p className="text-zinc-500 text-sm mb-4">Site pages, managed in the CMS editor.</p>
      {pages.length === 0 && <p className="text-zinc-500">No pages yet.</p>}
      <GlassPanel className="p-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Name</th>
              <th className="font-normal">Path</th>
              <th className="font-normal">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-2 text-zinc-100">{p.name}</td>
                <td className="text-zinc-500">/{getFullPath(p, pages)}</td>
                <td><Badge tone={p.status === 'published' ? 'published' : 'draft'}>{p.status}</Badge></td>
                <td className="text-right px-2">
                  <Link to={`/admin/pages/${p.id}`} className="text-glass-sky hover:underline text-xs">Edit in CMS</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
