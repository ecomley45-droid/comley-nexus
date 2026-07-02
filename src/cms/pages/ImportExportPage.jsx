import { useRef, useState } from 'react';
import { exportCsv, downloadTemplate, importCsv } from '../lib/csvClient.js';
import { GlassPanel, GlassButton } from '../lib/ui/Glass.jsx';

const TYPES = [
  { scope: 'cms', type: 'pages', label: 'Pages', note: 'Section HTML is carried in a content_json column — not meant for spreadsheet editing, but nothing is lost on export → import.' },
  { scope: 'cms', type: 'library', label: 'Library templates' },
  { scope: 'cms', type: 'redirects', label: 'Redirects' },
  { scope: 'cms', type: 'comments', label: 'Comments' },
  { scope: 'cms', type: 'team', label: 'Team roster' },
  { scope: 'commerce', type: 'products', label: 'Products', keyNote: 'Matched by SKU (or id) on import.' },
  { scope: 'commerce', type: 'orders', label: 'Orders', keyNote: 'Create-only for new rows; matching an existing id only updates its status.' },
  { scope: 'commerce', type: 'customers', label: 'Customers', keyNote: 'Matched by clerk_id (or email) on import.' },
  { scope: 'commerce', type: 'campaigns', label: 'Discounts', keyNote: 'Matched by code on import.' },
];

function TypeCard({ scope, type, label, note, keyNote }) {
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const text = await file.text();
      const res = await importCsv(scope, type, text);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <GlassPanel className="p-4">
      <h3 className="font-medium text-zinc-100 mb-1">{label}</h3>
      {note && <p className="text-xs text-zinc-500 mb-2">{note}</p>}
      {keyNote && <p className="text-xs text-zinc-500 mb-2">{keyNote}</p>}
      <div className="flex gap-2 flex-wrap mb-2">
        <GlassButton variant="secondary" onClick={() => downloadTemplate(scope, type, `${type}.template.csv`)} className="text-xs py-1.5">
          Download template
        </GlassButton>
        <GlassButton variant="secondary" onClick={() => exportCsv(scope, type, `${type}.csv`)} className="text-xs py-1.5">
          Export all
        </GlassButton>
        <GlassButton onClick={() => fileRef.current?.click()} disabled={busy} className="text-xs py-1.5">
          {busy ? 'Importing…' : 'Import CSV'}
        </GlassButton>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && (
        <p className="text-xs text-zinc-400">
          {result.created} created, {result.updated} updated
          {result.errors?.length > 0 && `, ${result.errors.length} row(s) failed`}
          {result.errors?.length > 0 && (
            <span className="block mt-1 text-amber-400">
              {result.errors.map((e) => `Row ${e.row}: ${e.message}`).join(' · ')}
            </span>
          )}
        </p>
      )}
    </GlassPanel>
  );
}

export default function ImportExportPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Import / Export</h1>
      <p className="text-zinc-500 text-sm mb-4">
        Bulk CSV in and out of every content type. Import upserts — a row matching an existing record
        updates it, otherwise a new record is created.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {TYPES.map((t) => <TypeCard key={`${t.scope}-${t.type}`} {...t} />)}
      </div>

      <GlassPanel className="p-4 mt-4">
        <h3 className="font-medium text-zinc-100 mb-1">Not supported</h3>
        <p className="text-xs text-zinc-500">
          <strong>Media</strong> — binary files can't round-trip through CSV; upload assets from the Media page instead.{' '}
          <strong>Audit log</strong> and <strong>A/B stats</strong> — append-only/derived data, not something to import.
        </p>
      </GlassPanel>
    </div>
  );
}
