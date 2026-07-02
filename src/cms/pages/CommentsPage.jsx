import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getComments, resolveComment, deleteComment } from '../lib/api.js';
import { usePagesStore } from '../lib/usePagesStore.js';
import { GlassPanel, GlassSelect } from '../lib/ui/Glass.jsx';

export default function CommentsPage() {
  const [comments, setComments] = useState([]);
  const [filter, setFilter] = useState('unresolved');
  const { pages } = usePagesStore();

  const load = () => getComments().then(setComments);
  useEffect(() => { load(); }, []);

  const visible = comments.filter((c) => (filter === 'all' ? true : filter === 'unresolved' ? !c.resolved : c.resolved));
  const pageName = (id) => pages?.find((p) => p.id === id)?.name || id;

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Comments</h1>
        <GlassSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="text-sm">
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </GlassSelect>
      </div>

      {visible.length === 0 && <p className="text-zinc-500">No comments here.</p>}

      {visible.map((c) => (
        <GlassPanel key={c.id} className={`p-3 mb-2 ${c.resolved ? 'opacity-60' : ''}`}>
          <p className="text-sm text-zinc-100">{c.text}</p>
          <div className="flex justify-between text-xs text-zinc-500 mt-2">
            <span>
              <Link to={`/admin/pages/${c.pageId}`} className="hover:underline text-glass-sky">{pageName(c.pageId)}</Link> · {c.author}
            </span>
            <div className="flex gap-2">
              <button onClick={async () => { await resolveComment(c.id, !c.resolved); load(); }} className="hover:underline">
                {c.resolved ? 'Reopen' : 'Resolve'}
              </button>
              <button onClick={async () => { await deleteComment(c.id); load(); }} className="text-red-400 hover:underline">Delete</button>
            </div>
          </div>
        </GlassPanel>
      ))}
    </div>
  );
}
