import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSystems } from '../../lib/api.js';
import { GlassPanel, Badge } from '../../lib/ui/Glass.jsx';
import { Avatar } from '../../lib/AssigneePicker.jsx';

const STATE_META = {
  available: { color: '#22c55e', label: 'Available' },
  issue: { color: '#f59e0b', label: 'Issue' },
  outage: { color: '#ef4444', label: 'Outage' },
};

const TYPE_LABEL = {
  bug: 'Bug', non_functioning: 'Non-functioning', critical: 'Critical', feature_request: 'Feature',
};

function Diamond({ color }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rotate-45 rounded-[2px] shrink-0"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function ageDHM(ms) {
  const s = (Date.now() - ms) / 1000;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemStatusPage() {
  const [systems, setSystems] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSystems().then(setSystems).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!systems) return <p className="text-zinc-400">Loading…</p>;

  const allGood = systems.every((s) => s.state === 'available');
  const issues = systems.filter((s) => s.state !== 'available').length;

  return (
    <div className="max-w-[900px] flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: allGood ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}
        >
          {allGood ? (
            <svg className="w-5 h-5" fill="none" stroke="#22c55e" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="#f59e0b" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          )}
        </span>
        <div>
          <h1 className="text-2xl font-semibold">System Status</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {allGood
              ? 'All systems operational.'
              : `${issues} system${issues === 1 ? '' : 's'} reporting issues. Click a system to see its top priority tickets.`}
          </p>
        </div>
      </header>

      <div className="flex items-center gap-5 text-sm text-zinc-400 flex-wrap">
        {['available', 'issue', 'outage'].map((k) => (
          <span key={k} className="inline-flex items-center gap-2">
            <Diamond color={STATE_META[k].color} /> {STATE_META[k].label}
          </span>
        ))}
      </div>

      <GlassPanel className="overflow-hidden !p-0">
        {systems.map((s, i) => {
          const meta = STATE_META[s.state];
          const isOpen = openId === s.id;
          return (
            <div key={s.id} className={i > 0 ? 'border-t border-white/10' : ''}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
              >
                <Diamond color={meta.color} />
                <span className="font-medium text-zinc-100 flex-1 min-w-0 truncate">{s.name}</span>
                {s.open > 0 && <span className="text-xs text-zinc-500 whitespace-nowrap">{s.open} open</span>}
                <span className="text-sm font-medium whitespace-nowrap" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <svg
                  className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="px-5 pb-4 bg-white/[0.02]">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 pt-1 pb-2">
                    Top priority tickets
                  </div>
                  {s.tickets.length === 0 ? (
                    <p className="py-2 text-sm text-zinc-500">No open tickets — all clear.</p>
                  ) : (
                    <ul className="border-t border-white/5">
                      {s.tickets.map((t) => (
                        <li key={t.id} className="border-b border-white/5 last:border-b-0">
                          <Link
                            to={`/admin/feedback?ticket=${t.id}`}
                            className="flex items-center gap-2.5 py-2.5 px-1 hover:bg-white/[0.03] rounded-md"
                          >
                            <Badge tone="default">{TYPE_LABEL[t.type] || t.type}</Badge>
                            {t.urgent && <span className="text-red-400 text-[10px] font-bold uppercase">Urgent</span>}
                            <span className="text-sm text-zinc-200 flex-1 truncate">{t.note || '—'}</span>
                            <span className="text-xs text-zinc-500 whitespace-nowrap">{ageDHM(t.created_at)}</span>
                            {t.assignee_name ? (
                              <Avatar name={t.assignee_name} image={t.assignee_image} size={20} />
                            ) : (
                              <span className="text-[11px] text-zinc-500 italic">Unassigned</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </GlassPanel>
    </div>
  );
}
