import { useEffect, useRef, useState } from 'react';

// Small colored initials chip when no image is present. Deterministic color
// per name so the same dev always looks the same across surfaces.
const PALETTE = ['#6366f1', '#0e7490', '#b45309', '#9d174d', '#15803d', '#7c3aed', '#be123c'];

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(seed) {
  let h = 0;
  for (let i = 0; i < (seed || '').length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, image, size = 22 }) {
  const [broken, setBroken] = useState(false);
  if (image && !broken) {
    return (
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: colorFor(name || '?') }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/**
 * Compact dropdown for (re)assigning a ticket. Renders as a chip that shows
 * the current assignee (avatar + name, or "Unassigned"); clicking opens a
 * portal-free menu with each dev + their active workload count.
 */
export default function AssigneePicker({ value, valueName, valueImage, assignees, onChange, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = assignees.find((a) => a.email === value);
  const display = value
    ? { name: current?.name || valueName || value, image: current?.image ?? valueImage ?? null }
    : null;
  const btnClass = size === 'lg'
    ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm'
    : 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs';

  return (
    <div ref={wrapRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${btnClass} backdrop-blur-xl bg-white/[0.06] border border-white/15 text-zinc-100 hover:bg-white/[0.10] transition`}
      >
        {display ? (
          <>
            <Avatar name={display.name} image={display.image} size={size === 'lg' ? 22 : 18} />
            <span className="truncate max-w-[9rem]">{display.name}</span>
          </>
        ) : (
          <>
            <span
              className="inline-flex items-center justify-center rounded-full border border-dashed border-white/25 text-white/40"
              style={{ width: size === 'lg' ? 22 : 18, height: size === 'lg' ? 22 : 18 }}
              aria-hidden
            >+</span>
            <span className="text-zinc-400 italic">Unassigned</span>
          </>
        )}
        <svg className={`w-3 h-3 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-40 right-0 mt-1 min-w-[16rem] backdrop-blur-2xl bg-zinc-900/80 border border-white/10 rounded-xl shadow-2xl p-1"
        >
          <button
            type="button"
            onClick={() => { setOpen(false); onChange(null); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-300 hover:bg-white/10 text-left"
          >
            <span
              className="inline-flex items-center justify-center rounded-full border border-dashed border-white/25 text-white/40"
              style={{ width: 20, height: 20 }}
              aria-hidden
            >+</span>
            <span className="italic">Unassigned</span>
          </button>
          <div className="my-1 border-t border-white/10" />
          {assignees.map((a) => {
            const selected = a.email === value;
            return (
              <button
                key={a.email}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { setOpen(false); onChange(a.email); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left ${selected ? 'bg-white/10 text-zinc-100' : 'text-zinc-300 hover:bg-white/10'}`}
              >
                <Avatar name={a.name} image={a.image} size={20} />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300 shrink-0">
                  {a.active_count}
                </span>
              </button>
            );
          })}
          {assignees.length === 0 && (
            <p className="px-2 py-2 text-xs text-zinc-500">No devs yet — mark someone as a dev in their profile.</p>
          )}
        </div>
      )}
    </div>
  );
}
