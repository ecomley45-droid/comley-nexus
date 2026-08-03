import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { getLibrary, saveLibrary, getPages } from '../lib/api.js';
import { syncUsageMap } from '../../shared/syncedBlocks.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea } from '../lib/ui/Glass.jsx';

export default function LibraryPage() {
  const [library, setLibrary] = useState(null);
  const [usage, setUsage] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    getLibrary().then(setLibrary).catch((e) => setError(e.message));
    // Editing an entry changes every page linked to it, so the count of what
    // an edit will affect belongs right next to the textarea.
    getPages().then((d) => setUsage(syncUsageMap(d.pages))).catch(() => setUsage({}));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!library) return <p className="text-zinc-300">Loading…</p>;

  const persist = async (next) => {
    setLibrary(next);
    await saveLibrary(next);
  };

  const addEntry = () => {
    persist([...library, { id: 'lib-' + Date.now(), name: 'New template', html: '<div class="p-8">New template</div>' }]);
  };
  const updateEntry = (id, patch) => persist(library.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeEntry = (id) => persist(library.filter((l) => l.id !== id));

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Section library</h1>
        <GlassButton onClick={addEntry}>New template</GlassButton>
      </div>
      <p className="text-sm text-zinc-500 mb-4 max-w-2xl">
        Reusable sections, available from &ldquo;Insert from library&rdquo; in the page editor. Inserted
        <strong className="text-zinc-300"> linked</strong>, a block keeps following the version here — edit it
        once and every page using it updates. Inserted as a
        <strong className="text-zinc-300"> copy</strong>, it belongs to that page from then on.
      </p>

      {library.length === 0 && <p className="text-zinc-500">No templates yet.</p>}

      {library.map((entry) => (
        <GlassPanel key={entry.id} className="p-3 mb-3">
          <div className="flex justify-between items-center mb-2">
            <GlassInput value={entry.name} onChange={(e) => updateEntry(entry.id, { name: e.target.value })} className="flex-1 mr-2 py-1" />
            {usage[entry.id] > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-glass-sky mr-2 shrink-0" title="Linked blocks that update when you edit this">
                <Link2 size={11} /> {usage[entry.id]} page block{usage[entry.id] === 1 ? '' : 's'}
              </span>
            )}
            <button
              onClick={() => {
                if (usage[entry.id] > 0 && !confirm(`${usage[entry.id]} linked block(s) use this. They will keep their current content but stop updating. Delete it?`)) return;
                removeEntry(entry.id);
              }}
              className="text-red-400 hover:text-red-300 text-xs shrink-0"
            >
              Delete
            </button>
          </div>
          <GlassTextarea value={entry.html} onChange={(e) => updateEntry(entry.id, { html: e.target.value })} rows={4} className="w-full" />
        </GlassPanel>
      ))}
    </div>
  );
}
