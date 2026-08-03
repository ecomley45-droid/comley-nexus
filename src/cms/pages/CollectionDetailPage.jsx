import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Trash2, Settings2, ChevronDown } from 'lucide-react';
import {
  getCollectionEntries, updateCollection, createEntry, updateEntry, deleteEntry, getMedia,
} from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect, Badge } from '../lib/ui/Glass.jsx';
import EmptyState from '../lib/ui/EmptyState.jsx';
import { useConfirm } from '../lib/ui/useConfirm.jsx';
import { useOrgBase, useIsAdmin } from '../lib/useMe.jsx';
import { FIELD_TYPES, keyify, normalizeEntryData } from '../../shared/collectionFields.js';

// One collection: its field designer (admin) and its entries (editor).
//
// Entries save on blur rather than on every keystroke — each save re-validates
// server-side and can rewrite the slug, so per-character round trips would
// fight the person typing.

function FieldRow({ field, onChange, onRemove, onMove, isFirst, isLast }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 mb-2">
      <div className="flex gap-1.5 items-center mb-1.5">
        <GlassInput
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value, key: field.locked ? field.key : keyify(e.target.value) })}
          placeholder="Field name"
          className="flex-1 min-w-0 py-1"
        />
        <GlassSelect value={field.type} onChange={(e) => onChange({ type: e.target.value })} className="w-32 py-1 text-xs">
          {Object.entries(FIELD_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </GlassSelect>
        <button onClick={() => onMove(-1)} disabled={isFirst} className="text-zinc-400 hover:text-zinc-100 disabled:opacity-30 text-xs px-1">↑</button>
        <button onClick={() => onMove(1)} disabled={isLast} className="text-zinc-400 hover:text-zinc-100 disabled:opacity-30 text-xs px-1">↓</button>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300 px-1"><Trash2 size={12} /></button>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ required: e.target.checked })} className="w-3.5 h-3.5" />
          Required
        </label>
        <span className="text-[11px] text-zinc-600 font-mono">{`{{${field.key}}}`}</span>
        <span className="text-[11px] text-zinc-600">{FIELD_TYPES[field.type]?.help}</span>
      </div>
      {field.type === 'select' && (
        <GlassInput
          value={(field.options || []).join(', ')}
          onChange={(e) => onChange({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="Choices, comma separated"
          className="w-full mt-1.5 py-1 text-xs"
        />
      )}
    </div>
  );
}

function EntryEditor({ collection, entry, onSave, onRemove }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(entry.data);
  const [error, setError] = useState('');
  const [media, setMedia] = useState([]);
  useEffect(() => { setDraft(entry.data); }, [entry.data]);
  useEffect(() => { if (open) getMedia().then(setMedia).catch(() => setMedia([])); }, [open]);

  const titleKey = collection.fields[0]?.key;
  const title = draft?.[titleKey] || entry.slug;

  const commit = async (patch) => {
    setError('');
    try { await onSave({ data: { ...draft, ...patch } }); }
    catch (e) { setError(e.message); }
  };

  const input = (field) => {
    const value = draft?.[field.key] ?? '';
    const set = (v) => setDraft((d) => ({ ...d, [field.key]: v }));
    const common = { value, onChange: (e) => set(e.target.value), onBlur: () => commit({}), className: 'w-full' };
    switch (field.type) {
      case 'textarea':
      case 'richtext':
        return <GlassTextarea {...common} rows={field.type === 'richtext' ? 6 : 3} />;
      case 'number':
        return <GlassInput type="number" {...common} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />;
      case 'boolean':
        return (
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={value === true} onChange={(e) => { set(e.target.checked); commit({ [field.key]: e.target.checked }); }} className="w-4 h-4" />
            Yes
          </label>
        );
      case 'date':
        return <GlassInput type="date" {...common} />;
      case 'select':
        return (
          <GlassSelect value={value} onChange={(e) => { set(e.target.value); commit({ [field.key]: e.target.value }); }} className="w-full">
            <option value="">—</option>
            {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </GlassSelect>
        );
      case 'image':
        return (
          <div className="flex gap-1.5">
            {media.length > 0 && (
              <GlassSelect
                value=""
                onChange={(e) => { const m = media.find((x) => x.id === e.target.value); if (m) { set(m.url); commit({ [field.key]: m.url }); } }}
                className="w-28 shrink-0"
              >
                <option value="">Library…</option>
                {media.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </GlassSelect>
            )}
            <GlassInput {...common} placeholder="https://…" className="flex-1 min-w-0" />
          </div>
        );
      default:
        return <GlassInput {...common} />;
    }
  };

  return (
    <GlassPanel className="p-3 mb-2">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          <ChevronDown size={13} className={`text-zinc-500 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="text-sm text-zinc-100 truncate">{String(title) || 'Untitled'}</span>
          {entry.status === 'draft' && <Badge tone="draft">draft</Badge>}
        </button>
        <span className="text-[11px] text-zinc-600 font-mono shrink-0 hidden sm:inline">/{entry.slug}</span>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 size={13} /></button>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-white/10">
          {collection.fields.map((f) => (
            <div key={f.key} className="mb-3">
              <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
                {f.label}{f.required && <span className="text-amber-400/80"> *</span>}
              </label>
              {input(f)}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <GlassSelect
              value={entry.status}
              onChange={(e) => onSave({ status: e.target.value })}
              className="py-1 text-xs"
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </GlassSelect>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

export default function CollectionDetailPage() {
  const { id } = useParams();
  const base = useOrgBase() || '/admin';
  const isAdmin = useIsAdmin();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [showFields, setShowFields] = useState(false);
  const [pendingFields, setPendingFields] = useState(null);
  const [confirm, confirmUi] = useConfirm();

  const load = () => getCollectionEntries(id).then(setState).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const collection = state?.collection;
  const fields = pendingFields ?? collection?.fields ?? [];
  const dirty = pendingFields !== null;

  const add = async () => {
    try {
      // A blank required field would be rejected server-side, so seed the
      // first field with something rather than bouncing the click.
      const seed = normalizeEntryData({ [collection.fields[0]?.key]: 'New entry' }, collection.fields);
      await createEntry(id, { data: seed, status: 'draft' });
      await load();
    } catch (e) { setError(e.message); }
  };

  const saveFields = async () => {
    try { await updateCollection(id, { fields }); setPendingFields(null); await load(); }
    catch (e) { setError(e.message); }
  };

  const saveDetail = async (patch) => {
    try { await updateCollection(id, patch); await load(); } catch (e) { setError(e.message); }
  };

  const blockHint = useMemo(() => (collection ? `Add a "Collection List" block and pick ${collection.name}.` : ''), [collection]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!state) return <p className="text-zinc-300">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold">{collection.name}</h1>
        <Link to={`${base}/collections`} className="text-sm text-glass-sky hover:underline">← All collections</Link>
      </div>
      <p className="text-sm text-zinc-400 mb-4">{blockHint}</p>

      {isAdmin && (
        <GlassPanel className="p-4 mb-4">
          <button onClick={() => setShowFields(!showFields)} className="flex items-center gap-2 text-sm text-zinc-200">
            <Settings2 size={14} className="text-zinc-400" />
            Fields &amp; detail pages
            <ChevronDown size={13} className={`text-zinc-500 transition-transform ${showFields ? '' : '-rotate-90'}`} />
          </button>
          {showFields && (
            <div className="mt-3 pt-3 border-t border-white/10">
              {fields.map((f, i) => (
                <FieldRow
                  key={i}
                  field={f}
                  isFirst={i === 0}
                  isLast={i === fields.length - 1}
                  onChange={(patch) => setPendingFields(fields.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                  onRemove={() => setPendingFields(fields.filter((_, j) => j !== i))}
                  onMove={(dir) => {
                    const j = i + dir;
                    if (j < 0 || j >= fields.length) return;
                    const next = [...fields];
                    [next[i], next[j]] = [next[j], next[i]];
                    setPendingFields(next);
                  }}
                />
              ))}
              <div className="flex flex-wrap gap-2 items-center">
                <GlassButton
                  variant="secondary"
                  onClick={() => setPendingFields([...fields, { key: `field_${fields.length + 1}`, label: `Field ${fields.length + 1}`, type: 'text' }])}
                  className="py-1.5 text-xs"
                >
                  <Plus size={12} /> Add field
                </GlassButton>
                {dirty && <GlassButton onClick={saveFields} className="py-1.5 text-xs">Save fields</GlassButton>}
                {dirty && <button onClick={() => setPendingFields(null)} className="text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>}
              </div>
              <p className="text-[11px] text-zinc-600 mt-2 leading-relaxed">
                Removing a field deletes its content from every entry. Entries are rewritten to match
                the new field list when you save.
              </p>

              <div className="mt-4 pt-3 border-t border-white/10">
                <label className="flex items-center gap-2 text-xs text-zinc-300 mb-2">
                  <input
                    type="checkbox"
                    checked={!!collection.detailEnabled}
                    onChange={(e) => saveDetail({ detailEnabled: e.target.checked, detailBase: collection.detailBase || collection.slug })}
                    className="w-3.5 h-3.5"
                  />
                  Give each entry its own page
                </label>
                {collection.detailEnabled && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] text-zinc-500">URL</span>
                    <GlassInput
                      value={collection.detailBase || ''}
                      onChange={(e) => setState((s) => ({ ...s, collection: { ...s.collection, detailBase: e.target.value } }))}
                      onBlur={(e) => saveDetail({ detailBase: e.target.value })}
                      className="w-40 py-1 text-xs"
                    />
                    <span className="text-[11px] text-zinc-600 font-mono">/{collection.detailBase}/&lt;entry&gt;</span>
                    <p className="text-[11px] text-zinc-600 w-full leading-relaxed mt-1">
                      Pick which page renders an entry in <strong className="text-zinc-400">Pages</strong> — put
                      {' '}<code className="text-zinc-400">{'{{field_key}}'}</code> placeholders in its blocks and they fill in per entry.
                      A real page at the same URL always wins over a detail page.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-zinc-300">Entries ({state.entries.length})</h2>
        <GlassButton onClick={add} className="py-1.5 text-xs"><Plus size={12} /> New entry</GlassButton>
      </div>

      {state.entries.length === 0 && (
        <EmptyState
          compact
          icon={Plus}
          title={`No ${collection.name.toLowerCase()} yet`}
          action={{ label: 'Add the first entry', icon: Plus, onClick: add }}
        >
          Entries you add here appear anywhere a Collection List block points at{' '}
          {collection.name} — add once, and every page using it updates.
        </EmptyState>
      )}
      {confirmUi}
      {state.entries.map((entry) => (
        <EntryEditor
          key={entry.id}
          collection={collection}
          entry={entry}
          onSave={async (patch) => { await updateEntry(entry.id, patch); await load(); }}
          onRemove={async () => {
            const label = entry.data?.[collection.fields[0]?.key] || entry.slug;
            const ok = await confirm({
              title: `Delete “${label}”?`,
              body: collection.detailEnabled
                ? `Its page at /${collection.detailBase}/${entry.slug} will 404, and it disappears from every block showing this collection.`
                : 'It disappears from every block showing this collection.',
              confirmLabel: 'Delete entry',
            });
            if (!ok) return;
            await deleteEntry(entry.id); await load();
          }}
        />
      ))}
    </div>
  );
}
