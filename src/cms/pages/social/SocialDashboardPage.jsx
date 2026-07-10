import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSocialDashboard, pollSocialMetrics } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassSelect } from '../../lib/ui/Glass.jsx';
import { platformMeta } from './platformMeta.js';

const fmt = (n) => new Intl.NumberFormat().format(Math.round(n || 0));
const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;

// Tiny area sparkline. Faint baseline, filled area, emphasized endpoint —
// enough to show a trend without a charting dependency.
function Sparkline({ points, stroke = '#38bdf8' }) {
  if (!points || points.length < 2) return <div className="h-12" />;
  const w = 260, h = 48, pad = 3;
  const max = Math.max(...points, 1);
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${h - pad} L${xy[0][0].toFixed(1)},${h - pad} Z`;
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={stroke} opacity="0.12" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ex} cy={ey} r="2.5" fill={stroke} />
    </svg>
  );
}

function Kpi({ label, value, spark, stroke }) {
  return (
    <GlassPanel className="p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 tabular-nums mb-2">{value}</div>
      {spark && <Sparkline points={spark} stroke={stroke} />}
    </GlassPanel>
  );
}

export default function SocialDashboardPage() {
  const { orgSlug } = useParams();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = (d = days) => getSocialDashboard(d).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(days); /* eslint-disable-next-line */ }, [days]);

  const refresh = async () => {
    setRefreshing(true);
    try { await pollSocialMetrics(); await load(); } catch (e) { setError(e.message); } finally { setRefreshing(false); }
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return <p className="text-zinc-400">Loading…</p>;

  if (data.connected === 0) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold mb-2">Social</h1>
        <GlassPanel className="p-6 text-center">
          <p className="text-zinc-300 mb-1">No accounts connected yet.</p>
          <p className="text-zinc-500 text-sm mb-4">Connect Instagram, Facebook, X, LinkedIn or TikTok to see performance here.</p>
          <Link to={`/${orgSlug}/social/accounts`}><GlassButton>Connect an account</GlassButton></Link>
        </GlassPanel>
      </div>
    );
  }

  const impSpark = data.series.map((s) => s.impressions);
  const engSpark = data.series.map((s) => s.engagements);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Social dashboard</h1>
        <div className="flex items-center gap-2">
          <GlassSelect value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </GlassSelect>
          <GlassButton variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</GlassButton>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Followers" value={fmt(data.kpis.followers)} />
        <Kpi label="Impressions" value={fmt(data.kpis.impressions)} spark={impSpark} stroke="#38bdf8" />
        <Kpi label="Engagements" value={fmt(data.kpis.engagements)} spark={engSpark} stroke="#c084fc" />
        <Kpi label="Engagement rate" value={pct(data.kpis.engagementRate)} />
      </div>

      <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wide">By account</h2>
      <div className="space-y-2">
        {data.accounts.map((a) => {
          const meta = platformMeta(a.platform);
          return (
            <GlassPanel key={a.id} className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: meta.color }}>{meta.short}</span>
                <div className="min-w-0">
                  <div className="text-zinc-100 font-medium truncate">{a.handle || meta.label}</div>
                  <div className="text-xs text-zinc-500">{meta.label}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-zinc-100 font-semibold tabular-nums">{fmt(a.followers)}</div>
                <div className="text-xs text-zinc-500">followers</div>
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
