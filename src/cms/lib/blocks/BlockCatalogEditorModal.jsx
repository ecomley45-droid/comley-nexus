import { useState } from 'react';
import { GlassPanel, GlassButton, GlassInput, GlassSelect } from '../ui/Glass.jsx';
import { BLOCK_RENDERERS, renderBlock } from '../pasteIn/blockRenderers.js';
import StructuredBlockEditor from '../pasteIn/StructuredBlockEditor.jsx';
import { BASE_CATEGORIES } from './catalog.js';
import { createBlockCatalogEntry, updateBlockCatalogEntry } from '../api.js';

const BLOCK_TYPES = Object.keys(BLOCK_RENDERERS);

// Create/edit a catalog entry -- either the platform-wide catalog (Super
// Admin) or a workspace's own custom entry, depending on where this is
// opened from (see `scope` prop). Reuses StructuredBlockEditor's field
// editors against the entry's defaultFields, the same component the page
// editor uses for an actual placed block.
export default function BlockCatalogEditorModal({ entry, scope, onClose, onSaved }) {
  const isNew = !entry;
  const [blockType, setBlockType] = useState(entry?.blockType || BLOCK_TYPES[0]);
  const [name, setName] = useState(entry?.name || '');
  const [category, setCategory] = useState(entry?.category || BASE_CATEGORIES[0]);
  const [description, setDescription] = useState(entry?.description || '');
  const [defaultFields, setDefaultFields] = useState(entry?.defaultFields || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fakeSection = { blockType, fields: defaultFields, html: renderBlock(blockType, defaultFields) || '' };

  const save = async () => {
    if (!name.trim()) return setError('Name is required.');
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        await createBlockCatalogEntry({
          orgId: scope === 'workspace' ? true : null,
          blockType, name: name.trim(), category, description: description.trim(), defaultFields,
        });
      } else {
        await updateBlockCatalogEntry(entry.id, { name: name.trim(), category, description: description.trim(), defaultFields });
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-10 p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-zinc-100">{isNew ? 'New block' : `Edit "${entry.name}"`}</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Name</label>
              <GlassInput value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Category</label>
              <GlassInput value={category} onChange={(e) => setCategory(e.target.value)} className="w-full" list="block-categories" />
              <datalist id="block-categories">
                {BASE_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {isNew && (
            <div className="mb-3">
              <label className="text-xs text-zinc-400 block mb-1">Base template</label>
              <GlassSelect value={blockType} onChange={(e) => setBlockType(e.target.value)} className="w-full">
                {BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </GlassSelect>
              <p className="text-[11px] text-zinc-500 mt-1">
                Which layout this block renders with. Can't be changed after creating it.
              </p>
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs text-zinc-400 block mb-1">Description</label>
            <GlassInput value={description} onChange={(e) => setDescription(e.target.value)} className="w-full" placeholder="Shown in the picker" />
          </div>

          <div className="border-t border-white/10 pt-3 mb-3">
            <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Default content</h3>
            <StructuredBlockEditor section={fakeSection} onChange={(patch) => setDefaultFields(patch.fields)} />
          </div>

          {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={onClose}>Cancel</GlassButton>
            <GlassButton onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</GlassButton>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
