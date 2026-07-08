// Storage for central events (migration 021). Org-scoped like lib/storage.js:
// every call takes an orgId and filters on it. `calendars` are named buckets;
// `events` belong to a calendar (or none) and are what event blocks display.

import { db } from './db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[eventsStore/${msg}] ${error.message}`);
};
const rid = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function calRow(r) {
  return { id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order };
}
function eventRow(r) {
  return {
    id: r.id, calendarId: r.calendar_id, title: r.title, description: r.description,
    location: r.location, startsAt: r.starts_at, endsAt: r.ends_at, allDay: r.all_day,
    flyerUrl: r.flyer_url, linkUrl: r.link_url,
  };
}

export const calendars = {
  async list(orgId) {
    const { data, error } = await db().from('calendars')
      .select('id, name, color, sort_order').eq('org_id', orgId)
      .order('sort_order', { ascending: true });
    throwOn('calendars.list', error);
    return (data || []).map(calRow);
  },
  async create(orgId, { name, color, sortOrder }) {
    const { data, error } = await db().from('calendars')
      .insert({ id: rid('cal'), org_id: orgId, name: name || 'Untitled calendar', color: color || '#6366f1', sort_order: sortOrder ?? 0 })
      .select('id, name, color, sort_order').maybeSingle();
    throwOn('calendars.create', error);
    return calRow(data);
  },
  async update(orgId, id, patch) {
    const cols = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) cols.name = patch.name;
    if (patch.color !== undefined) cols.color = patch.color;
    if (patch.sortOrder !== undefined) cols.sort_order = patch.sortOrder;
    const { data, error } = await db().from('calendars').update(cols)
      .eq('org_id', orgId).eq('id', id).select('id, name, color, sort_order').maybeSingle();
    throwOn('calendars.update', error);
    return data ? calRow(data) : null;
  },
  async remove(orgId, id) {
    // Events cascade-delete via the FK (on delete cascade).
    const { error } = await db().from('calendars').delete().eq('org_id', orgId).eq('id', id);
    throwOn('calendars.remove', error);
  },
};

export const events = {
  // `calendarId` filters to one calendar; omit (or 'all') for every event in
  // the org. Ordered by start time ascending.
  async list(orgId, { calendarId } = {}) {
    let q = db().from('events')
      .select('id, calendar_id, title, description, location, starts_at, ends_at, all_day, flyer_url, link_url')
      .eq('org_id', orgId);
    if (calendarId && calendarId !== 'all') q = q.eq('calendar_id', calendarId);
    const { data, error } = await q.order('starts_at', { ascending: true, nullsFirst: false });
    throwOn('events.list', error);
    return (data || []).map(eventRow);
  },
  async create(orgId, e) {
    const { data, error } = await db().from('events').insert({
      id: rid('evt'), org_id: orgId, calendar_id: e.calendarId || null,
      title: e.title || 'Untitled event', description: e.description || '', location: e.location || '',
      starts_at: e.startsAt || null, ends_at: e.endsAt || null, all_day: !!e.allDay,
      flyer_url: e.flyerUrl || '', link_url: e.linkUrl || '',
    }).select('id, calendar_id, title, description, location, starts_at, ends_at, all_day, flyer_url, link_url').maybeSingle();
    throwOn('events.create', error);
    return eventRow(data);
  },
  async update(orgId, id, patch) {
    const map = { calendarId: 'calendar_id', title: 'title', description: 'description', location: 'location',
      startsAt: 'starts_at', endsAt: 'ends_at', allDay: 'all_day', flyerUrl: 'flyer_url', linkUrl: 'link_url' };
    const cols = { updated_at: new Date().toISOString() };
    for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) cols[col] = patch[k];
    const { data, error } = await db().from('events').update(cols)
      .eq('org_id', orgId).eq('id', id)
      .select('id, calendar_id, title, description, location, starts_at, ends_at, all_day, flyer_url, link_url').maybeSingle();
    throwOn('events.update', error);
    return data ? eventRow(data) : null;
  },
  async remove(orgId, id) {
    const { error } = await db().from('events').delete().eq('org_id', orgId).eq('id', id);
    throwOn('events.remove', error);
  },
};
