import { useEffect, useState } from 'react';
import { getLibrary, saveLibrary } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea } from '../lib/ui/Glass.jsx';

export default function LibraryPage() {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getLibrary().then(setLibrary).catch((e) => setError(e.message));
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
      <p className="text-sm text-zinc-500 mb-4">
        Reusable section templates available from the "Insert from library" dropdown in the page editor.
      </p>

      {library.length === 0 && <p className="text-zinc-500">No templates yet.</p>}

      {library.map((entry) => (
        <GlassPanel key={entry.id} className="p-3 mb-3">
          <div className="flex justify-between items-center mb-2">
            <GlassInput value={entry.name} onChange={(e) => updateEntry(entry.id, { name: e.target.value })} className="flex-1 mr-2 py-1" />
            <button onClick={() => removeEntry(entry.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
          </div>
          <GlassTextarea value={entry.html} onChange={(e) => updateEntry(entry.id, { html: e.target.value })} rows={4} className="w-full" />
        </GlassPanel>
      ))}
    </div>
  );
}
