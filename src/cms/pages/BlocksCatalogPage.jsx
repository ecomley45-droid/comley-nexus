import { useEffect, useState } from 'react';
import { fetchBlockCatalog, categoriesFor } from '../lib/blocks/catalog.js';
import { deleteBlockCatalogEntry } from '../lib/api.js';
import BlockPreviewFrame from '../lib/blocks/BlockPreviewFrame.jsx';
import BlockCatalogEditorModal from '../lib/blocks/BlockCatalogEditorModal.jsx';
import { GlassPanel, GlassButton } from '../lib/ui/Glass.jsx';
import { useMe, useIsSuperAdmin } from '../lib/useMe.jsx';

// Browsable + editable catalog of every pre-built block (see catalog.js).
// The "Add Block +" picker in the page editor (BlockCatalogPicker.jsx)
// shares this exact same data so the two surfaces can never drift apart.
//
// Platform-wide entries are Super-Admin-editable only; a workspace's own
// entries are editable by that workspace's own editors/admins. Mounted
// under both /:orgSlug/blocks and /super-admin/blocks (see App.jsx) --
// which controls are shown depends on which context this renders in.
export default function BlocksCatalogPage() {
  const { me } = useMe();
  const isSuperAdmin = useIsSuperAdmin();
  const canEditWorkspace = ['editor', 'admin'].includes(me?.org?.role);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { entry } for edit, {} for new
  const [newScope, setNewScope] = useState(null);

  const refresh = () => {
    fetchBlockCatalog().then(setEntries).catch((e) => setError(e.message));
  };
  useEffect(refresh, []);

  const canEdit = (entry) => (entry.scope === 'platform' ? isSuperAdmin : canEditWorkspace);

  const remove = async (entry) => {
    if (!confirm(`Remove "${entry.name}" from the catalog? Pages that already used it are unaffected.`)) return;
    try { await deleteBlockCatalogEntry(entry.id); refresh(); } catch (e) { alert(e.message); }
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!entries) return <p className="text-zinc-400">Loading…</p>;

  const categories = categoriesFor(entries);

  return (
    <div className="max-w-6xl">
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-2xl font-semibold">Blocks</h1>
        <div className="flex gap-2">
          {canEditWorkspace && (
            <GlassButton variant="secondary" onClick={() => setNewScope('workspace')}>New workspace block</GlassButton>
          )}
          {isSuperAdmin && (
            <GlassButton onClick={() => setNewScope('platform')}>New platform block</GlassButton>
          )}
        </div>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Every pre-built block available from "Add Block +" in the page editor. {entries.length} total.
      </p>

      {categories.map((category) => {
        const catEntries = entries.filter((b) => b.category === category);
        if (catEntries.length === 0) return null;
        return (
          <section key={category} className="mb-8">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {catEntries.map((entry) => (
                <GlassPanel key={entry.id} className="overflow-hidden">
                  <BlockPreviewFrame html={entry.html} height={150} />
                  <div className="p-3">
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-medium text-zinc-100">{entry.name}</div>
                      {entry.scope === 'workspace' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-glass-sky/15 text-sky-300 border border-glass-sky/30">Yours</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{entry.description}</div>
                    {canEdit(entry) && (
                      <div className="flex gap-3 mt-2">
                        <button onClick={() => setEditing(entry)} className="text-xs text-glass-sky hover:underline">Edit</button>
                        <button onClick={() => remove(entry)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                      </div>
                    )}
                  </div>
                </GlassPanel>
              ))}
            </div>
          </section>
        );
      })}

      {editing && (
        <BlockCatalogEditorModal
          entry={editing}
          scope={editing.scope}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {newScope && (
        <BlockCatalogEditorModal
          entry={null}
          scope={newScope}
          onClose={() => setNewScope(null)}
          onSaved={() => { setNewScope(null); refresh(); }}
        />
      )}
    </div>
  );
}
