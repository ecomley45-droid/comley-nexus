import { useCallback, useEffect, useState } from 'react';
import { getSchedule, getPreferences, savePreferences } from '../../lib/api.js';
import { GlassPanel } from '../../lib/ui/Glass.jsx';
import { Avatar } from '../../lib/AssigneePicker.jsx';

const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_START = 6;
const HOUR_END = 20;
const HOUR_SPAN = HOUR_END - HOUR_START;

function fmtHour(h) {
  if (h == null) return '—';
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  const ampm = whole >= 12 ? 'PM' : 'AM';
  const disp = whole % 12 === 0 ? 12 : whole % 12;
  return `${disp}${min ? `:${String(min).padStart(2, '0')}` : ''} ${ampm}`;
}

function DevCalendar({ dev }) {
  const start = dev.work_start ?? 9;
  const end = dev.work_end ?? 17;
  const days = dev.work_days ?? [1, 2, 3, 4, 5]; // 1=Mon..7=Sun (ISO)
  const topPct = ((Math.max(HOUR_START, start) - HOUR_START) / HOUR_SPAN) * 100;
  const heightPct = ((Math.min(HOUR_END, end) - Math.max(HOUR_START, start)) / HOUR_SPAN) * 100;

  return (
    <GlassPanel className="p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2.5">
        <Avatar name={dev.name} image={dev.image} size={28} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">{dev.name}</div>
          <div className="text-xs text-zinc-500">{fmtHour(start)} – {fmtHour(end)}</div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_LABEL.map((label, i) => {
          const dayNum = i + 1; // 1=Mon
          const working = days.includes(dayNum);
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-zinc-500">{label}</span>
              <div className="relative w-full rounded-md bg-white/[0.03] border border-white/10 overflow-hidden" style={{ height: 96 }}>
                {working && (
                  <div
                    className="absolute left-0 right-0 bg-glass-indigo/25 border-y border-glass-indigo/40"
                    style={{ top: `${topPct}%`, height: `${heightPct}%` }}
                    title={`Working hours ${fmtHour(start)} – ${fmtHour(end)}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-zinc-500 mt-auto">
        Drag the card handle to rearrange. Working hours are set by each dev in their profile.
      </div>
    </GlassPanel>
  );
}

export default function SchedulePage() {
  const [devs, setDevs] = useState([]);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [dragEmail, setDragEmail] = useState(null);
  const [overEmail, setOverEmail] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, prefs] = await Promise.all([getSchedule(), getPreferences()]);
      setDevs(list);
      const base = list.map((d) => d.email);
      const saved = Array.isArray(prefs.schedule_order) ? prefs.schedule_order : null;
      if (saved) {
        const valid = saved.filter((e) => base.includes(e));
        const missing = base.filter((e) => !valid.includes(e));
        setOrder([...valid, ...missing]);
      } else {
        setOrder(base);
      }
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = (next) => {
    setOrder(next);
    savePreferences({ schedule_order: next }).catch(() => {});
  };

  const handleDrop = (target) => {
    if (dragEmail && dragEmail !== target && order) {
      const arr = order.slice();
      const from = arr.indexOf(dragEmail);
      const to = arr.indexOf(target);
      if (from >= 0 && to >= 0) {
        arr.splice(from, 1);
        arr.splice(to, 0, dragEmail);
        persist(arr);
      }
    }
    setDragEmail(null);
    setOverEmail(null);
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!order) return <p className="text-zinc-400">Loading…</p>;

  const byEmail = new Map(devs.map((d) => [d.email, d]));
  const ordered = order.map((e) => byEmail.get(e)).filter(Boolean);

  return (
    <div className="max-w-[1400px] flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Team working hours. Drag a calendar to rearrange — your layout is saved to your profile.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ordered.map((dev) => (
          <div
            key={dev.email}
            draggable
            onDragStart={() => setDragEmail(dev.email)}
            onDragEnd={() => { setDragEmail(null); setOverEmail(null); }}
            onDragOver={(e) => { e.preventDefault(); if (overEmail !== dev.email) setOverEmail(dev.email); }}
            onDrop={() => handleDrop(dev.email)}
            className={`transition-all ${overEmail === dev.email && dragEmail && dragEmail !== dev.email ? 'ring-2 ring-glass-indigo/50' : ''} ${dragEmail === dev.email ? 'opacity-50' : ''}`}
          >
            <DevCalendar dev={dev} />
          </div>
        ))}
      </div>
    </div>
  );
}
