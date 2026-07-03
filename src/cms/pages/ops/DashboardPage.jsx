import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOpsDashboard } from '../../lib/api.js';
import { GlassPanel, Badge } from '../../lib/ui/Glass.jsx';
import { Avatar } from '../../lib/AssigneePicker.jsx';

const TYPE_LABEL = {
  bug: 'Bug', non_functioning: 'Non-functioning', critical: 'Critical', feature_request: 'Feature',
};

function fmtBytes(sec) {
  if (sec == null || Number.isNaN(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
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

function StateGlow({ state }) {
  const styles = {
    outage: 'shadow-[0_0_16px_rgba(239,68,68,0.5)] border-red-500/70',
    issue: 'shadow-[0_0_16px_rgba(234,179,8,0.45)] border-amber-400/70',
    available: 'shadow-[0_0_16px_rgba(34,197,94,0.45)] border-emerald-400/70',
  };
  const dot = state === 'outage' ? '#ef4444' : state === 'issue' ? '#eab308' : '#22c55e';
  const label = state === 'outage' ? 'Non-functioning' : state === 'issue' ? 'Open tickets' : 'All clear';
  return { ring: styles[state] || styles.available, dot, label };
}

// Small hand-rolled bar chart: two overlaid bars per day, submitted (light) as
// the backdrop and completed (accent) drawn on top at the same baseline. Uses
// inline SVG so we don't add a chart lib to this repo.
function CalendarChart({ data, monthLabel }) {
  if (!data?.length) return null;
  const max = Math.max(2, ...data.map((d) => d.submitted));
  const barW = 12;
  const gap = 6;
  const chartW = data.length * (barW + gap);
  const chartH = 160;
  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={chartH + 32} className="min-w-full">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            y1={chartH * (1 - f)}
            x2={chartW}
            y2={chartH * (1 - f)}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 3"
          />
        ))}
        {data.map((d, i) => {
          const x = i * (barW + gap);
          const submittedH = (d.submitted / max) * chartH;
          const completedH = (d.completed / max) * chartH;
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={chartH - submittedH}
                width={barW}
                height={submittedH}
                rx={2}
                fill="#c7d2fe"
                fillOpacity="0.55"
              />
              <rect
                x={x}
                y={chartH - completedH}
                width={barW}
                height={completedH}
                rx={2}
                fill="#6366f1"
              />
              <text
                x={x + barW / 2}
                y={chartH + 14}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(255,255,255,0.4)"
              >
                {d.day}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-zinc-400 mt-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#c7d2fe', opacity: 0.55 }} /> Submitted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#6366f1' }} /> Completed
        </span>
        <span className="ml-auto">{monthLabel}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getOpsDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="flex flex-col gap-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Operations overview for feedback tickets.</p>
      </div>

      <GlassPanel className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-zinc-200 m-0">Tickets submitted vs. completed</h2>
        </div>
        <CalendarChart data={data.calendar} monthLabel={data.monthLabel} />
      </GlassPanel>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-200 m-0">Systems</h2>
          <Link to="/admin/ops/system-status" className="text-xs text-glass-indigo hover:underline">See all →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.systems.map((s) => {
            const glow = StateGlow({ state: s.state });
            return (
              <div
                key={s.id}
                className={`rounded-xl border-2 bg-white/[0.03] p-4 flex flex-col gap-1.5 transition ${glow.ring}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: glow.dot }} />
                  <span className="text-sm font-semibold text-zinc-100 truncate">{s.name}</span>
                </div>
                <div className="text-2xl font-bold text-zinc-100 leading-none">{s.open}</div>
                <div className="text-xs text-zinc-500">open · {s.total} total</div>
                <div className="text-[11px] font-medium mt-1" style={{ color: glow.dot }}>{glow.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      <GlassPanel className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-200 m-0">Priority tickets</h2>
          <Link to="/admin/feedback" className="text-xs text-glass-indigo hover:underline">Open Feedback →</Link>
        </div>
        {data.topTickets.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">No open tickets. Nice.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.topTickets.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/admin/feedback?ticket=${t.id}`}
                  className="flex items-center gap-3 py-2 hover:bg-white/[0.03] rounded-md px-1"
                >
                  <Badge tone="default">{TYPE_LABEL[t.type] || t.type}</Badge>
                  {t.urgent && <span className="text-red-400 text-[10px] font-bold uppercase">Urgent</span>}
                  <span className="text-sm text-zinc-200 flex-1 truncate">{t.note}</span>
                  <span className="text-xs text-zinc-500 whitespace-nowrap">{ageDHM(t.created_at)}</span>
                  {t.assignee_name ? (
                    <Avatar name={t.assignee_name} image={t.assignee_image} size={22} />
                  ) : (
                    <span className="text-[11px] text-zinc-500 italic">Unassigned</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassPanel className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Daily ticket average</div>
          <div className="text-3xl font-bold text-zinc-100 mt-1">{(data.dailyAvg || 0).toFixed(1)}</div>
          <div className="text-xs text-zinc-500 mt-1">tickets / day · last 30 days</div>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Avg. time to complete</div>
          <div className="text-3xl font-bold text-zinc-100 mt-1">{fmtBytes(data.avgCompletionSec)}</div>
          <div className="text-xs text-zinc-500 mt-1">from created to resolved</div>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Highest ticketed service</div>
          <div className="text-3xl font-bold text-zinc-100 mt-1 truncate">{data.highestService.name}</div>
          <div className="text-xs text-zinc-500 mt-1">{data.highestService.count} tickets total</div>
        </GlassPanel>
      </section>
    </div>
  );
}
