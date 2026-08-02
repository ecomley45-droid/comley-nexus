// Small, dumb form primitives for the Design inspector. They exist so the
// inspector reads as a list of design decisions rather than a wall of
// <input>s, and so every control shares the same "unset vs set" behavior:
// a control whose value is undefined shows a muted placeholder and emits
// nothing into the compiled CSS until the user actually touches it. That's
// what keeps an untouched block byte-identical on the published page.

import { useState } from 'react';
import { ChevronDown, Link2, Unlink, RotateCcw } from 'lucide-react';

export function InspectorGroup({ title, icon: Icon, summary, defaultOpen = false, onReset, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] mb-2 overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 flex items-center gap-2 px-3 py-2.5 text-left min-w-0 hover:bg-white/[0.03] transition"
        >
          <ChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
          {Icon && <Icon size={14} className="text-zinc-400 shrink-0" />}
          <span className="text-sm text-zinc-200 truncate">{title}</span>
          {!open && summary && <span className="text-[11px] text-zinc-500 truncate ml-auto pl-2">{summary}</span>}
        </button>
        {open && onReset && (
          <button
            onClick={onReset}
            title="Reset this group"
            className="px-2.5 py-2.5 text-zinc-500 hover:text-zinc-200 transition"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      {open && <div className="px-3 pb-3 pt-1 border-t border-white/[0.07]">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`mb-3 ${className}`}>
      {label && <label className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">{label}</label>}
      {children}
      {hint && <p className="text-[11px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

// Segmented button row. Clicking the already-selected option clears it back
// to "not set" (unless `required`), which is how a user undoes a single
// choice without hunting for a reset button.
export function Segmented({ options, value, onChange, required = false, className = '' }) {
  return (
    <div className={`flex items-center gap-0.5 p-0.5 rounded-lg bg-black/20 border border-white/10 ${className}`}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            title={opt.label}
            aria-pressed={active}
            onClick={() => onChange(active && !required ? undefined : opt.value)}
            className={`flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
              active ? 'bg-white/15 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
          >
            {Icon ? <Icon size={14} /> : opt.short || opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Slider + numeric box. `placeholder` is what the box shows while the value
// is unset, i.e. the value the block already renders at on its own.
export function NumberSlider({ value, onChange, min = 0, max = 100, step = 1, unit = 'px', placeholder = 'auto' }) {
  const isSet = value !== undefined && value !== null && value !== '';
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={isSet ? value : min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 min-w-0 h-1 accent-glass-indigo cursor-pointer"
      />
      <div className="relative shrink-0">
        <input
          type="number"
          value={isSet ? value : ''}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-[5rem] bg-white/[0.06] border border-white/15 rounded-lg pl-2 pr-6 py-1 text-xs text-zinc-100 placeholder:text-[10px] placeholder:text-zinc-600 outline-none focus:border-glass-indigo/60"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 pointer-events-none">{unit}</span>
      </div>
    </div>
  );
}

// A native color input plus a text box (so a theme variable like
// var(--color-accent) can be typed) plus one-click swatches drawn from the
// workspace theme, so blocks stay on-brand without picking hexes by eye.
export function ColorField({ value, onChange, swatches = [], allowClear = true }) {
  const isHex = /^#[0-9a-f]{3,8}$/i.test(String(value || ''));
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="relative w-8 h-8 shrink-0 rounded-lg border border-white/15 overflow-hidden cursor-pointer bg-[repeating-conic-gradient(#333_0_25%,#555_0_50%)] bg-[length:10px_10px]">
          <span className="absolute inset-0" style={{ background: value || 'transparent' }} />
          <input
            type="color"
            value={isHex ? value.slice(0, 7) : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="Not set"
          className="flex-1 min-w-0 bg-white/[0.06] border border-white/15 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-glass-indigo/60"
        />
        {allowClear && value && (
          <button onClick={() => onChange(undefined)} className="text-zinc-500 hover:text-zinc-200 text-xs px-1" title="Clear">✕</button>
        )}
      </div>
      {swatches.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {swatches.map((s) => (
            <button
              key={s.value}
              title={s.label}
              onClick={() => onChange(s.value)}
              className="w-5 h-5 rounded-md border border-white/20 hover:scale-110 transition"
              style={{ background: s.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ToggleRow({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer select-none">
      <span className="min-w-0">
        <span className="block text-xs text-zinc-300 truncate">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-600">{hint}</span>}
      </span>
      <span
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={`relative w-8 h-[18px] shrink-0 rounded-full transition ${checked ? 'bg-glass-indigo' : 'bg-white/15'}`}
      >
        <span className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  );
}

const SIDES = ['top', 'right', 'bottom', 'left'];

// Four-sided box editor with a link toggle, laid out like the padding
// diagram in a browser's element inspector — top field above, left/right
// either side, bottom below. Linking edits all four at once, which is what
// people want ~90% of the time.
export function BoxField({ value = {}, onChange, min = 0, max = 200, sides = SIDES }) {
  const [linked, setLinked] = useState(() => {
    const set = sides.map((s) => value?.[s]).filter((v) => v !== undefined);
    return set.length <= 1 || set.every((v) => v === set[0]);
  });

  const setSide = (side, raw) => {
    const next = raw === '' || raw === undefined ? undefined : Number(raw);
    if (linked) {
      const all = {};
      for (const s of sides) if (next !== undefined) all[s] = next;
      onChange(Object.keys(all).length ? all : undefined);
      return;
    }
    const merged = { ...value };
    if (next === undefined) delete merged[side]; else merged[side] = next;
    onChange(Object.keys(merged).length ? merged : undefined);
  };

  const box = (side) => (
    <input
      key={side}
      type="number"
      min={min}
      max={max}
      value={value?.[side] ?? ''}
      placeholder="–"
      title={side}
      onChange={(e) => setSide(side, e.target.value)}
      className="w-full bg-white/[0.06] border border-white/15 rounded-lg px-1 py-1 text-center text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-glass-indigo/60"
    />
  );

  const has = (side) => sides.includes(side);

  return (
    <div className="flex items-center gap-2">
      <div className="grid grid-cols-3 gap-1 flex-1 min-w-0 items-center">
        <div />
        {has('top') ? box('top') : <div />}
        <div />
        {has('left') ? box('left') : <div />}
        <div className="text-[10px] text-zinc-600 text-center select-none">px</div>
        {has('right') ? box('right') : <div />}
        <div />
        {has('bottom') ? box('bottom') : <div />}
        <div />
      </div>
      <button
        onClick={() => setLinked(!linked)}
        title={linked ? 'Edit each side separately' : 'Edit all sides together'}
        className={`shrink-0 w-7 h-7 grid place-items-center rounded-lg border transition ${
          linked ? 'bg-glass-indigo/20 border-glass-indigo/40 text-indigo-200' : 'bg-white/[0.06] border-white/15 text-zinc-500 hover:text-zinc-200'
        }`}
      >
        {linked ? <Link2 size={13} /> : <Unlink size={13} />}
      </button>
    </div>
  );
}
