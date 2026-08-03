import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Plus, Trash2 } from 'lucide-react';
import { getCollections, createCollection, deleteCollection } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, Badge } from '../lib/ui/Glass.jsx';
import { useOrgBase, useIsAdmin } from '../lib/useMe.jsx';

// The list of a workspace's content types. Creating and deleting a type is
// admin-only (it rewrites entries and can change public URLs); filling those
// types with entries is ordinary editor work, one level down.
export default function CollectionsPage() {
  const base = useOrgBase() || '/admin';
  const isAdmin = useIsAdmin();
  const [collections, setCollections] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getCollections().then((d) => setCollections(d.collections)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Seeded with the two fields essentially every collection needs, so a
      // new type is immediately usable instead of an empty shell.
      await createCollection({
        name: name.trim(),
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'description', label: 'Description', type: 'textarea' },
        ],
      });
      setName('');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const remove = async (c) => {
    if (!confirm(`Delete "${c.name}" and all of its entries? This can't be undone.`)) return;
    try { await deleteCollection(c.id); await load(); } catch (e) { setError(e.message); }
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!collections) return <p className="text-zinc-300">Loading…</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold">Collections</h1>
      </div>
      <p className="text-sm text-zinc-400 mb-4 max-w-2xl">
        Your own content types — case studies, recipes, properties, job openings. Define the fields
        once, add entries, then drop a <strong className="text-zinc-200">Collection List</strong> block
        on any page. Edit an entry and every page showing it updates.
      </p>

      {isAdmin && (
        <GlassPanel className="p-4 mb-5 flex flex-wrap gap-2 items-center">
          <GlassInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
            placeholder="Name a new collection — e.g. Case Studies"
            className="flex-1 min-w-[16rem]"
          />
          <GlassButton onClick={create} disabled={busy || !name.trim()}>
            <Plus size={14} /> Create
          </GlassButton>
        </GlassPanel>
      )}

      {collections.length === 0 && (
        <p className="text-zinc-500">No collections yet{isAdmin ? ' — create one above.' : '.'}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {collections.map((c) => (
          <GlassPanel key={c.id} className="p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <Link to={`${base}/collections/${c.id}`} className="min-w-0">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-zinc-400 shrink-0" />
                  <span className="text-sm font-medium text-zinc-100 truncate">{c.name}</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">/{c.slug}</div>
              </Link>
              {isAdmin && (
                <button onClick={() => remove(c)} title="Delete collection" className="text-red-400 hover:text-red-300 shrink-0">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {c.description && <p className="text-xs text-zinc-400 line-clamp-2">{c.description}</p>}
            <div className="flex flex-wrap gap-1 mt-auto pt-1">
              {c.fields.slice(0, 5).map((f) => (
                <span key={f.key} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-zinc-400">
                  {f.label}
                </span>
              ))}
              {c.fields.length > 5 && <span className="text-[10px] text-zinc-500">+{c.fields.length - 5}</span>}
            </div>
            {c.detailEnabled && <Badge>Detail pages at /{c.detailBase}</Badge>}
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
