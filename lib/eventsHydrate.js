// Serve-time hydration of calendar-bound event blocks. The public page
// renderer (server.js) calls this on a page before compilePageHtml: any
// section whose block is bound to a calendar (fields.calendarId set) has its
// stored `html` regenerated from the calendar's live events, so central
// events show up everywhere without re-saving the page.
//
// Untouched for manual blocks (no calendarId) and for the platform site
// (orgId null) -- those keep their authored html exactly as stored.

import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';
import { EVENT_BOUND_TYPES, applyEventsToFields } from '../src/shared/eventsMap.js';
import { events as eventsStore } from './eventsStore.js';

export async function hydrateEventBlocks(page, orgId, timeZone) {
  if (!orgId || !page || !Array.isArray(page.content)) return page;
  const bound = page.content.filter(
    (s) => EVENT_BOUND_TYPES.includes(s.blockType) && s.fields && s.fields.calendarId,
  );
  if (bound.length === 0) return page;

  // Fetch each distinct calendar selection once.
  const cache = new Map();
  const fetchFor = async (calendarId) => {
    if (!cache.has(calendarId)) {
      cache.set(calendarId, await eventsStore.list(orgId, { calendarId }).catch(() => []));
    }
    return cache.get(calendarId);
  };

  page.content = await Promise.all(page.content.map(async (section) => {
    if (!EVENT_BOUND_TYPES.includes(section.blockType) || !section.fields?.calendarId) return section;
    const evts = await fetchFor(section.fields.calendarId);
    const fields = applyEventsToFields(section.blockType, section.fields, evts, { timeZone });
    return { ...section, html: renderBlock(section.blockType, fields) || section.html };
  }));
  return page;
}
