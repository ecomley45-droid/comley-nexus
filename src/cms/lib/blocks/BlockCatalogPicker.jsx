import { useEffect, useState } from 'react';
import { fetchBlockCatalog, categoriesFor, buildSectionFromCatalog } from './catalog.js';
import { GlassPanel } from '../ui/Glass.jsx';
import BlockPreviewFrame from './BlockPreviewFrame.jsx';

// "Add Block +" picker in the page editor's Blocks panel. Picking an entry
// appends a normal section with blockType/fields/html already set to
// realistic placeholder content -- editable afterward exactly like a
// paste-in imported block, via the same Structured/Raw HTML toggle.
export default function BlockCatalogPicker({ onClose, onInsert, excludeTypes = [] }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    // excludeTypes: opened from inside a Layout block's column, this
    // filters out 'layout' so a Layout can't be nested inside itself --
    // v1 keeps nesting one level deep only.
    fetchBlockCatalog().then((all) => setEntries(all.filter((e) => !excludeTypes.includes(e.blockType)))).catch((e) => setError(e.message));
  }, []);

  const categories = entries ? categoriesFor(entries) : [];
  const visible = !entries ? [] : activeCategory === 'All' ? entries : entries.filter((b) => b.category === activeCategory);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-10 p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-zinc-100">Add a block</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>

          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          {!entries && !error && <p className="text-sm text-zinc-400 py-8 text-center">Loading blocks…</p>}

          {entries && (
            <>
              <div className="flex gap-1.5 flex-wrap mb-4">
                {['All', ...categories].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      activeCategory === cat
                        ? 'bg-gradient-to-tr from-glass-indigo to-glass-fuchsia text-white border-transparent'
                        : 'text-zinc-400 border-white/10 hover:text-zinc-100 hover:bg-white/5'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[65vh] overflow-y-auto pr-1">
                {visible.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => onInsert(buildSectionFromCatalog(entry))}
                    className="text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-glass-indigo/40 transition overflow-hidden"
                  >
                    <BlockPreviewFrame html={entry.html} height={110} />
                    <div className="p-3">
                      <div className="flex items-center gap-1.5">
                        <div className="text-sm font-medium text-zinc-100">{entry.name}</div>
                        {entry.scope === 'workspace' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-glass-sky/15 text-sky-300 border border-glass-sky/30">Yours</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{entry.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
