// Maps central-calendar events onto the field shapes the event blocks
// already render (see blockRenderers.js). Pure + shared so the server's
// serve-time hydration (lib/eventsHydrate.js) and the editor's live preview
// produce byte-identical output from the same events.
//
// A block opts into a calendar via fields.calendarId ('' = manual authoring,
// a real id = that calendar, 'all' = every calendar). This module only runs
// when a calendar is bound; it replaces the relevant field (items or images)
// with the calendar's events.

export const EVENT_BOUND_TYPES = ['events-list', 'calendar', 'flyer-slider'];

// Expand recurring events into concrete future occurrences (non-recurring
// events pass through unchanged). Used by both serve-time hydration and the
// editor preview so they match. The iCal feed uses RRULE instead (infinite),
// but display needs finite occurrences.
function stepDate(date, rec) {
  const d = new Date(date);
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  else if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  return d;
}

export function expandRecurring(events, { now = new Date(), horizonMonths = 18, max = 200 } = {}) {
  const horizon = new Date(now); horizon.setMonth(horizon.getMonth() + horizonMonths);
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const out = [];
  for (const ev of (events || [])) {
    const rec = ev.recurrence || 'none';
    if (rec === 'none' || !ev.startsAt) { out.push(ev); continue; }
    const start = new Date(ev.startsAt);
    if (isNaN(start)) { out.push(ev); continue; }
    const until = ev.recurrenceUntil ? new Date(ev.recurrenceUntil) : null;
    const dur = ev.endsAt ? (new Date(ev.endsAt) - start) : 0;
    let cur = start; let count = 0;
    while (cur <= horizon && count < max) {
      if (until && cur > until) break;
      if (cur >= from) {
        out.push({ ...ev, startsAt: cur.toISOString(), endsAt: dur ? new Date(cur.getTime() + dur).toISOString() : ev.endsAt });
      }
      cur = stepDate(cur, rec); count += 1;
    }
  }
  return out;
}

// --- Per-calendar color accent ----------------------------------------------
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Wrap a block's html so its --color-accent (and derived vars) become the
// calendar's color -- CSS custom properties cascade to the block's markup.
export function accentWrap(html, color) {
  const rgb = hexRgb(color);
  if (!rgb) return html;
  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  const onAccent = lum > 0.6 ? '#111111' : '#ffffff';
  const soft = `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`;
  return `<div style="--color-accent:${color};--accent-soft:${soft};--on-accent:${onAccent};">${html}</div>`;
}

function fmtChip(ev, tz) {
  if (!ev.startsAt) return 'TBD';
  const d = new Date(ev.startsAt);
  if (isNaN(d)) return 'TBD';
  const opts = tz ? { timeZone: tz } : {};
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...opts });
  if (ev.allDay) return date;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...opts });
  return `${date} · ${time}`;
}

// en-CA formats as YYYY-MM-DD; with a timeZone it's the calendar date there.
function ymd(ev, tz) {
  if (!ev.startsAt) return '';
  const d = new Date(ev.startsAt);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined);
}

export function applyEventsToFields(blockType, fields, events, opts = {}) {
  const tz = opts.timeZone;
  const list = (Array.isArray(events) ? [...events] : [])
    .sort((a, b) => (a.startsAt ? new Date(a.startsAt) : Infinity) - (b.startsAt ? new Date(b.startsAt) : Infinity));
  const f = { ...fields };
  if (blockType === 'events-list') {
    const limit = Number(fields.limit) > 0 ? Number(fields.limit) : list.length;
    f.items = list.slice(0, limit).map((ev) => ({
      meta: fmtChip(ev, tz),
      heading: ev.title,
      body: [ev.location, ev.description].filter(Boolean).join(' · '),
      link: ev.linkUrl || undefined,
    }));
  } else if (blockType === 'calendar') {
    f.items = list.map((ev) => ({ meta: ymd(ev, tz), heading: ev.title })).filter((it) => it.meta);
    if (!f.month && f.items[0]) f.month = f.items[0].meta.slice(0, 7);
  } else if (blockType === 'flyer-slider') {
    const imgs = list.filter((ev) => ev.flyerUrl).map((ev) => ({
      src: ev.flyerUrl,
      alt: [ev.title, fmtChip(ev, tz)].filter(Boolean).join(' — '),
    }));
    if (imgs.length) f.images = imgs; // otherwise keep the block's manual images
  }
  return f;
}
