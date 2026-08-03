import { useEffect, useState } from 'react';
import { getAudit } from '../lib/api.js';
import { GlassPanel } from '../lib/ui/Glass.jsx';
import EmptyState from '../lib/ui/EmptyState.jsx';
import { ScrollText } from 'lucide-react';

export default function AuditLogPage() {
  const [audit, setAudit] = useState([]);

  useEffect(() => { getAudit().then(setAudit); }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Audit log</h1>
      {audit.length === 0 && (
        <EmptyState compact icon={ScrollText} title="No activity yet">
          Every publish, deletion and settings change your team makes gets recorded here.
        </EmptyState>
      )}
      {audit.map((entry) => (
        <GlassPanel key={entry.id} className="p-3 mb-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-zinc-100">{entry.action}</span>
            <span className="text-zinc-500 text-xs">{new Date(entry.timestamp).toLocaleString()}</span>
          </div>
          <p className="text-zinc-400 text-sm mt-1">{entry.details}</p>
        </GlassPanel>
      ))}
    </div>
  );
}
