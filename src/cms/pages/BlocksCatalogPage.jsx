import { BLOCK_CATALOG, CATEGORIES } from '../lib/blocks/catalog.js';
import BlockPreviewFrame from '../lib/blocks/BlockPreviewFrame.jsx';
import { GlassPanel } from '../lib/ui/Glass.jsx';

// Browsable reference of every pre-built block (see catalog.js). Read-only
// in v1 -- inserting a block into a page happens via the "Add Block +"
// picker inside the page editor (BlockCatalogPicker.jsx), which shares this
// exact same catalog data so the two surfaces can never drift apart.
export default function BlocksCatalogPage() {
  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">Blocks</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Every pre-built block available from "Add Block +" in the page editor. {BLOCK_CATALOG.length} total.
      </p>

      {CATEGORIES.map((category) => {
        const entries = BLOCK_CATALOG.filter((b) => b.category === category);
        if (entries.length === 0) return null;
        return (
          <section key={category} className="mb-8">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {entries.map((entry) => (
                <GlassPanel key={entry.id} className="overflow-hidden">
                  <BlockPreviewFrame html={entry.html} height={150} />
                  <div className="p-3">
                    <div className="text-sm font-medium text-zinc-100">{entry.name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{entry.description}</div>
                  </div>
                </GlassPanel>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
