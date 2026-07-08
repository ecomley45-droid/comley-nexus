// Admin CRUD for central events: calendars and their events. Org-scoped and
// gated by requireRole('editor') like page/content editing. Read routes are
// also used by the page editor to populate the calendar-source picker and its
// live preview.

import { calendars, events } from './eventsStore.js';
import { requireRole } from './auth.js';

const requireOrg = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!req.org) return res.status(403).json({ error: 'No workspace on this account' });
  if (req.org.paused) return res.status(423).json({ error: 'Something went wrong. Please contact support.' });
  next();
};

export function mountEventsApi(app) {
  // ---- Calendars ----
  app.get('/api/calendars', requireOrg, async (req, res, next) => {
    try { res.json({ calendars: await calendars.list(req.org.id) }); } catch (e) { next(e); }
  });
  app.post('/api/calendars', requireOrg, requireRole('editor'), async (req, res, next) => {
    try { res.json({ calendar: await calendars.create(req.org.id, req.body || {}) }); } catch (e) { next(e); }
  });
  app.patch('/api/calendars/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
    try {
      const cal = await calendars.update(req.org.id, req.params.id, req.body || {});
      if (!cal) return res.status(404).json({ error: 'Calendar not found' });
      res.json({ calendar: cal });
    } catch (e) { next(e); }
  });
  app.delete('/api/calendars/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
    try { await calendars.remove(req.org.id, req.params.id); res.json({ success: true }); } catch (e) { next(e); }
  });

  // ---- Events ----
  app.get('/api/events', requireOrg, async (req, res, next) => {
    try { res.json({ events: await events.list(req.org.id, { calendarId: req.query.calendarId }) }); } catch (e) { next(e); }
  });
  app.post('/api/events', requireOrg, requireRole('editor'), async (req, res, next) => {
    try { res.json({ event: await events.create(req.org.id, req.body || {}) }); } catch (e) { next(e); }
  });
  app.patch('/api/events/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
    try {
      const ev = await events.update(req.org.id, req.params.id, req.body || {});
      if (!ev) return res.status(404).json({ error: 'Event not found' });
      res.json({ event: ev });
    } catch (e) { next(e); }
  });
  app.delete('/api/events/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
    try { await events.remove(req.org.id, req.params.id); res.json({ success: true }); } catch (e) { next(e); }
  });
}
