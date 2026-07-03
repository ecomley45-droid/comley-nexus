import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreferences, savePreferences, getUserStats, getViewer } from '../../lib/api.js';
import { GlassPanel, GlassSelect } from '../../lib/ui/Glass.jsx';
import { Avatar } from '../../lib/AssigneePicker.jsx';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
];

const DAYS = [
  { idx: 1, label: 'Mon' }, { idx: 2, label: 'Tue' }, { idx: 3, label: 'Wed' },
  { idx: 4, label: 'Thu' }, { idx: 5, label: 'Fri' }, { idx: 6, label: 'Sat' }, { idx: 7, label: 'Sun' },
];

const HOUR_OPTIONS = (() => {
  const out = [];
  for (let h = 6; h <= 22; h++) {
    for (const half of [0, 0.5]) {
      const v = h + half;
      const hr = Math.floor(v);
      const min = half === 0.5 ? ':30' : ':00';
      const ampm = hr >= 12 ? 'PM' : 'AM';
      const disp = hr % 12 === 0 ? 12 : hr % 12;
      out.push({ value: v, label: `${disp}${min} ${ampm}` });
    }
  }
  return out;
})();

const INTEGRATIONS = [
  { id: 'google', name: 'Google', note: 'Sign-in identity. Disconnecting signs you out of the app.', signout: true },
  { id: 'github', name: 'GitHub', note: 'Required for the Git Pull page (repos, branches, pulls).' },
  { id: 'slack', name: 'Slack', note: 'Mentions, channel alerts, and notifications.' },
  { id: 'claude', name: 'Claude', note: 'AI assistant for tickets and content.' },
  { id: 'chatgpt', name: 'ChatGPT', note: 'AI assistant for tickets and content.' },
  { id: 'gemini', name: 'Gemini', note: 'Optional Google AI features (rides on the Google connection above).', toggle: true },
];

function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Tile({ label, value, hint, tone }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-zinc-100';
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3.5 flex flex-col gap-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold leading-tight ${color}`}>{value}</div>
      {hint && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
    </div>
  );
}

function StatsSection() {
  const [period, setPeriod] = useState('month');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUserStats(period)
      .then((j) => { if (!cancelled) setStats(j); })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 m-0">Your stats</h2>
        <div className="inline-flex rounded-lg border border-white/10 overflow-hidden divide-x divide-white/10 backdrop-blur-xl bg-white/[0.04]">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              aria-pressed={period === p.value}
              className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                period === p.value ? 'bg-glass-indigo/40 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100'
              }`}
            >{p.label}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Tile label="Open tickets" value={loading ? '…' : String(stats?.openCount ?? 0)} hint="Assigned to you, still open" />
        <Tile label="Completed" value={loading ? '…' : String(stats?.completedCount ?? 0)} hint="Resolved or closed in this period" />
        <Tile label="Avg time to complete" value={loading ? '…' : fmtDuration(stats?.avgCompletionSec ?? null)} hint="Created → resolved" />
        <Tile label="Best (fastest)" value={loading ? '…' : fmtDuration(stats?.bestCompletionSec ?? null)} tone="good" />
        <Tile label="Worst (slowest)" value={loading ? '…' : fmtDuration(stats?.worstCompletionSec ?? null)} tone="bad" />
        <Tile
          label="Most productive day"
          value={loading ? '…' : stats?.mostProductiveDay ? stats.mostProductiveDay.label : '—'}
          hint={stats?.mostProductiveDay
            ? `${stats.mostProductiveDay.count} ticket${stats.mostProductiveDay.count === 1 ? '' : 's'} resolved`
            : 'No completions in this period'}
        />
      </div>
    </GlassPanel>
  );
}

function IntegrationsSection({ initial }) {
  const [state, setState] = useState(initial || {});

  const setOne = async (id, value) => {
    setState((s) => ({ ...s, [id]: value }));
    savePreferences({ integrations: { [id]: value } }).catch(() => {});
  };

  const disconnect = (id) => {
    if (id === 'google') {
      if (!window.confirm('Disconnecting Google will sign you out of the app. Continue?')) return;
      setOne('google', false);
      // Real sign-out would go through Clerk; leave it as a state-only stub.
      return;
    }
    setOne(id, false);
  };

  return (
    <GlassPanel className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 m-0 mb-4">Integrations</h2>
      <ul className="flex flex-col">
        {INTEGRATIONS.map((int, i) => {
          const connected = !!state[int.id];
          return (
            <li key={int.id} className={`flex items-center gap-4 py-3.5 ${i > 0 ? 'border-t border-white/10' : ''}`}>
              <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-zinc-100">
                {int.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-zinc-100">{int.name}</div>
                {int.note && <div className="text-xs text-zinc-500 mt-0.5">{int.note}</div>}
              </div>
              {int.toggle ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={connected}
                  onClick={() => setOne(int.id, !connected)}
                  className={`relative inline-block w-11 h-6 rounded-full transition-colors shrink-0 ${connected ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${connected ? 'translate-x-5' : ''}`} />
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={connected}
                    onClick={() => setOne(int.id, true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                      connected
                        ? 'bg-emerald-500 border-emerald-500 text-white cursor-default'
                        : 'bg-glass-indigo/60 border-glass-indigo text-white hover:bg-glass-indigo/80'
                    }`}
                  >
                    {connected && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                    {connected ? 'Connected' : 'Connect'}
                  </button>
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => disconnect(int.id)}
                    className={`inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                      connected
                        ? 'bg-red-500 border-red-500 text-white hover:bg-red-600'
                        : 'bg-white/[0.03] border-white/10 text-zinc-500 cursor-not-allowed'
                    }`}
                  >Disconnect</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}

function DisplayScheduleSection({ initial }) {
  const [view, setView] = useState(initial.view ?? 'list');
  const [detailMode, setDetailMode] = useState(initial.detail_mode ?? 'popup');
  const [workStart, setWorkStart] = useState(initial.work_start ?? 9);
  const [workEnd, setWorkEnd] = useState(initial.work_end ?? 17);
  const [workDays, setWorkDays] = useState(initial.work_days ?? [1, 2, 3, 4, 5]);
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);

  const flash = useCallback((s) => {
    setStatus(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 1800);
  }, []);

  const save = async (patch) => {
    setStatus('saving');
    try {
      await savePreferences(patch);
      flash('saved');
    } catch { flash('error'); }
  };

  const toggleDay = (d) => {
    const next = workDays.includes(d) ? workDays.filter((x) => x !== d) : [...workDays, d].sort((a, b) => a - b);
    setWorkDays(next);
    save({ work_days: next });
  };

  return (
    <>
      <div className="flex items-center justify-end h-5">
        {status === 'saving' && <span className="text-xs text-zinc-500">Saving…</span>}
        {status === 'saved' && <span className="text-xs text-emerald-400">Saved</span>}
        {status === 'error' && <span className="text-xs text-red-400">Could not save</span>}
      </div>

      <GlassPanel className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 m-0 mb-4">Display</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Feedback default view</label>
            <div className="inline-flex rounded-lg border border-white/10 overflow-hidden divide-x divide-white/10 backdrop-blur-xl bg-white/[0.04]">
              {[{ v: 'list', l: 'List' }, { v: 'card', l: 'Cards' }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => { setView(o.v); save({ view: o.v }); }}
                  aria-pressed={view === o.v}
                  className={`px-3 py-1.5 text-sm font-semibold ${
                    view === o.v ? 'bg-glass-indigo/40 text-white' : 'text-zinc-400 hover:bg-white/10'
                  }`}
                >{o.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Ticket detail opens as</label>
            <div className="inline-flex rounded-lg border border-white/10 overflow-hidden divide-x divide-white/10 backdrop-blur-xl bg-white/[0.04]">
              {[{ v: 'popup', l: 'Popup' }, { v: 'panel', l: 'Side panel' }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => { setDetailMode(o.v); save({ detail_mode: o.v }); }}
                  aria-pressed={detailMode === o.v}
                  className={`px-3 py-1.5 text-sm font-semibold ${
                    detailMode === o.v ? 'bg-glass-indigo/40 text-white' : 'text-zinc-400 hover:bg-white/10'
                  }`}
                >{o.l}</button>
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 m-0 mb-1">Schedule</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Your default working hours. Shown on the Schedule page.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Work start</label>
            <GlassSelect
              value={workStart}
              onChange={(e) => { const v = Number(e.target.value); setWorkStart(v); save({ work_start: v }); }}
              className="w-full"
            >
              {HOUR_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </GlassSelect>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Work end</label>
            <GlassSelect
              value={workEnd}
              onChange={(e) => { const v = Number(e.target.value); setWorkEnd(v); save({ work_end: v }); }}
              className="w-full"
            >
              {HOUR_OPTIONS.filter((h) => h.value > workStart).map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </GlassSelect>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-zinc-400 block mb-1.5">Work days</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d) => {
                const on = workDays.includes(d.idx);
                return (
                  <button
                    key={d.idx}
                    type="button"
                    onClick={() => toggleDay(d.idx)}
                    aria-pressed={on}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                      on
                        ? 'bg-glass-indigo/60 text-white border-glass-indigo'
                        : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >{d.label}</button>
                );
              })}
            </div>
          </div>
        </div>
      </GlassPanel>
    </>
  );
}

export default function ProfilePage() {
  const viewer = getViewer();
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPreferences().then(setPrefs).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!prefs) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-[900px] flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Avatar name={viewer.name} image={viewer.image} size={40} />
        <div>
          <h1 className="text-2xl font-semibold m-0">Profile &amp; preferences</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {viewer.name}
            {viewer.email && viewer.email !== viewer.name && ` · ${viewer.email}`}
          </p>
        </div>
      </header>

      <StatsSection />
      <IntegrationsSection initial={prefs.integrations} />
      <DisplayScheduleSection initial={prefs} />
    </div>
  );
}
