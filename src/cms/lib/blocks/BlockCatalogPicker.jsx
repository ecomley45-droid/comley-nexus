import { useState } from 'react';
import { BLOCK_CATALOG, CATEGORIES, buildSectionFromCatalog } from './catalog.js';
import { GlassPanel } from '../ui/Glass.jsx';
import BlockPreviewFrame from './BlockPreviewFrame.jsx';

// "Add Block +" picker in the page editor's Blocks panel. Picking an entry
// appends a normal section with blockType/fields/html already set to
// realistic placeholder content -- editable afterward exactly like a
// paste-in imported block, via the same Structured/Raw HTML toggle.
export default function BlockCatalogPicker({ onClose, onInsert }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const visible = activeCategory === 'All' ? BLOCK_CATALOG : BLOCK_CATALOG.filter((b) => b.category === activeCategory);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-10 p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-zinc-100">Add a block</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>

          <div className="flex gap-1.5 flex-wrap mb-4">
            {['All', ...CATEGORIES].map((cat) => (
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
                  <div className="text-sm font-medium text-zinc-100">{entry.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{entry.description}</div>
                </div>
              </button>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
