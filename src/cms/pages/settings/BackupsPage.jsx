import { useEffect, useState } from 'react';
import { getBackups, createBackup, restoreBackup, deleteBackup } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../lib/ui/Glass.jsx';
import { useMe } from '../../lib/useMe.jsx';

// Whole-site restore points (see migration 014). A backup is a full snapshot
// of every page + the theme/settings. Created automatically before every
// template install and every restore, and manually here. Admin only.
const REASON_LABEL = { manual: 'Manual', 'pre-install': 'Before install', 'pre-restore': 'Before restore' };

export default function BackupsPage() {
  const { me } = useMe();
  const isAdmin = me?.org?.role === 'admin';
  const [backups, setBackups] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = () => getBackups().then((d) => setBackups(d.backups)).catch((e) => setError(e.message));
  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  const onBackupNow = async () => {
    setBusy('new');
    try { await createBackup(); await refresh(); } catch (e) { alert(e.message); } finally { setBusy(''); }
  };

  const onRestore = async (b) => {
    if (!confirm(`Restore “${b.label}”?\n\nYour current site will be backed up first, then replaced with this snapshot.`)) return;
    setBusy(b.id);
    try {
      const res = await restoreBackup(b.id);
      await refresh();
      alert(`Restored ${res.pageCount} page(s). Reload the editor to see them.`);
    } catch (e) { alert(e.message); } finally { setBusy(''); }
  };

  const onDelete = async (b) => {
    if (!confirm(`Delete backup “${b.label}”? This can’t be undone.`)) return;
    setBusy(b.id);
    try { await deleteBackup(b.id); await refresh(); } catch (e) { alert(e.message); } finally { setBusy(''); }
  };

  if (!isAdmin) return <p className="text-zinc-400">Only workspace admins can manage site backups.</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Backups</h1>
        <GlassButton onClick={onBackupNow} disabled={busy === 'new'}>
          {busy === 'new' ? 'Backing up…' : 'Back up now'}
        </GlassButton>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        A backup snapshots every page and your theme. We keep the 10 most recent — older ones are removed automatically. Restoring saves a fresh backup first, so it’s always reversible.
      </p>

      {!backups ? (
        <p className="text-zinc-400">Loading…</p>
      ) : backups.length === 0 ? (
        <GlassPanel className="p-6 text-sm text-zinc-400">No backups yet. Click “Back up now” to create your first restore point.</GlassPanel>
      ) : (
        <div className="flex flex-col gap-2">
          {backups.map((b) => (
            <GlassPanel key={b.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-100">{b.label}</span>
                  <Badge tone={b.reason === 'manual' ? 'default' : 'draft'}>{REASON_LABEL[b.reason] || b.reason}</Badge>
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{new Date(b.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <GlassButton variant="secondary" disabled={busy === b.id} onClick={() => onRestore(b)}>
                  {busy === b.id ? 'Working…' : 'Restore'}
                </GlassButton>
                <GlassButton variant="danger" disabled={busy === b.id} onClick={() => onDelete(b)}>Delete</GlassButton>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
