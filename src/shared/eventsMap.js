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
  const list = Array.isArray(events) ? events : [];
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
