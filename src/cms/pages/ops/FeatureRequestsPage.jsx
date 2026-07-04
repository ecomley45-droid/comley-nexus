import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFeatureRequests } from '../../lib/api.js';
import { GlassPanel, Badge } from '../../lib/ui/Glass.jsx';
import { Avatar } from '../../lib/AssigneePicker.jsx';
import { useOrgBase } from '../../lib/useMe.jsx';

function ageDHM(ms) {
  if (!ms) return '—';
  const s = (Date.now() - ms) / 1000;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function SystemRow({ s }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="font-medium text-zinc-100 flex-1 min-w-0 truncate">{s.name}</span>
        <span className="text-xs text-zinc-500 whitespace-nowrap">
          {s.count} request{s.count === 1 ? '' : 's'}
        </span>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 bg-white/[0.02]">
          {s.tickets.length === 0 ? (
            <p className="py-2 text-sm text-zinc-500">No open feature requests.</p>
          ) : (
            <ul className="border-t border-white/5">
              {s.tickets.map((t) => (
                <li key={t.id} className="border-b border-white/5 last:border-b-0">
                  <Link
                    to={`${base}/feedback?ticket=${t.id}`}
                    className="flex items-center gap-2.5 py-2.5 px-1 hover:bg-white/[0.03] rounded-md"
                  >
                    {t.urgent && <span className="text-red-400 text-[10px] font-bold uppercase">Urgent</span>}
                    <span className="text-sm text-zinc-200 flex-1 truncate">{t.note || '—'}</span>
                    <Badge tone={t.status === 'in_progress' ? 'default' : 'default'}>{t.status.replace('_', ' ')}</Badge>
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
}

export default function FeatureRequestsPage() {
  const base = useOrgBase() || '/admin';
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getFeatureRequests().then(setProducts).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!products) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-[900px] flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Feature Requests</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Requested enhancements by product and system. Click a system to see its top requests.
        </p>
      </header>

      <div className="flex flex-col gap-7">
        {products.map((p) => (
          <section key={p.product}>
            <h2 className="text-xl font-bold text-zinc-100 mb-2">{p.product}</h2>
            <GlassPanel className="overflow-hidden !p-0">
              {p.systems.map((s, i) => (
                <div key={s.id} className={i > 0 ? 'border-t border-white/10' : ''}>
                  <SystemRow s={s} />
                </div>
              ))}
            </GlassPanel>
          </section>
        ))}
      </div>
    </div>
  );
}
