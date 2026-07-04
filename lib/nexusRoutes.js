// Routes for Nexus's own site content — the platform operator's pages, not
// any client's. Every route is gated by requireSuperAdmin only (ADMIN_EMAILS),
// never by org membership, since this content lives outside the orgs system
// entirely (see lib/nexus.js).

import * as nexus from './nexus.js';
import { requireSuperAdmin } from './auth.js';
import { sanitizePage, sanitizeGlobalSettings, sanitizeContentHtml } from './sanitize.js';

export function mountNexusApi(app) {
  app.get('/api/nexus/pages', requireSuperAdmin, async (req, res, next) => {
    try {
      await nexus.pages.applyScheduledPublishes();
      const [pages, globalSettings] = await Promise.all([
        nexus.pages.list(),
        nexus.settings.get(),
      ]);
      res.json({ pages, globalSettings });
    } catch (e) { next(e); }
  });

  app.post('/api/nexus/pages', requireSuperAdmin, async (req, res, next) => {
    try {
      const { pages, globalSettings: incomingGlobalSettings } = req.body;
      if (!pages || !Array.isArray(pages)) return res.status(400).json({ error: 'Invalid pages data structure' });
      const cleanPages = pages.map(sanitizePage);
      const oldPages = await nexus.pages.list();
      await nexus.versions.snapshot(oldPages, cleanPages);
      const written = await nexus.pages.bulkReplace(cleanPages);
      const updatedGlobals = incomingGlobalSettings
        ? await nexus.settings.replace(sanitizeGlobalSettings(incomingGlobalSettings))
        : await nexus.settings.get();
      res.json({ success: true, pages: written, globalSettings: updatedGlobals });
    } catch (e) { next(e); }
  });

  app.get('/api/nexus/versions/:pageId', requireSuperAdmin, async (req, res, next) => {
    try { res.json(await nexus.versions.listForPage(req.params.pageId)); }
    catch (e) { next(e); }
  });

  app.post('/api/nexus/versions/:pageId/:versionId/restore', requireSuperAdmin, async (req, res, next) => {
    try {
      const version = await nexus.versions.get(req.params.pageId, req.params.versionId);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      const pages = await nexus.pages.list();
      const targetIndex = pages.findIndex(p => p.id === req.params.pageId);
      if (targetIndex === -1) return res.status(404).json({ error: 'Page no longer exists' });
      const next = pages.map((p, i) => i === targetIndex ? version.snapshot : p);
      await nexus.versions.snapshot(pages, next);
      const written = await nexus.pages.bulkReplace(next);
      res.json({ success: true, pages: written });
    } catch (e) { next(e); }
  });

  app.get('/api/nexus/library', requireSuperAdmin, async (req, res, next) => {
    try { res.json(await nexus.library.list()); } catch (e) { next(e); }
  });

  app.post('/api/nexus/library', requireSuperAdmin, async (req, res, next) => {
    try {
      const entries = req.body;
      if (!Array.isArray(entries)) return res.status(400).json({ error: 'Invalid library data structure' });
      const clean = entries.map(e => ({ ...e, html: sanitizeContentHtml(e?.html || '') }));
      const written = await nexus.library.bulkReplace(clean);
      res.json({ success: true, library: written });
    } catch (e) { next(e); }
  });

  app.get('/api/nexus/redirects', requireSuperAdmin, async (req, res, next) => {
    try { res.json(await nexus.redirects.list()); } catch (e) { next(e); }
  });

  app.post('/api/nexus/redirects', requireSuperAdmin, async (req, res, next) => {
    try {
      const { from, to, type } = req.body;
      const cleanFrom = String(from ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const cleanTo = (to || '').trim();
      if (!cleanFrom || !cleanTo) return res.status(400).json({ error: 'from and to are required' });
      const existing = await nexus.redirects.getByFrom(cleanFrom);
      if (existing) return res.status(400).json({ error: `A redirect from "/${cleanFrom}" already exists.` });
      const entry = { id: 'nredir-' + Date.now(), from: cleanFrom, to: cleanTo, type: Number(type) === 301 ? 301 : 302 };
      await nexus.redirects.add(entry);
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.delete('/api/nexus/redirects/:id', requireSuperAdmin, async (req, res, next) => {
    try {
      const removed = await nexus.redirects.remove(req.params.id);
      if (!removed) return res.status(404).json({ error: 'Redirect not found' });
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.get('/api/nexus/settings', requireSuperAdmin, async (req, res, next) => {
    try { res.json(await nexus.settings.get()); } catch (e) { next(e); }
  });

  app.patch('/api/nexus/settings', requireSuperAdmin, async (req, res, next) => {
    try { res.json(await nexus.settings.replace(sanitizeGlobalSettings(req.body || {}))); }
    catch (e) { next(e); }
  });
}
