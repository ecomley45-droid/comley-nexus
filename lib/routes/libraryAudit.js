// The workspace audit trail, and the reusable section library that synced blocks point at.
//
// Extracted from server.js, which had grown past 1,500 lines of routing,
// auth, rendering, uploads and CSP in one file. Behaviour is unchanged: the
// handlers below are the same code, moved. Shared helpers arrive through
// `ctx` rather than closing over module scope, which is what makes the move
// possible without threading globals — the same pattern lib/collectionsRoutes.js
// already used.

export function registerLibraryAuditRoutes(app, ctx) {
  const { storage, requireOrg, requirePermission, sanitizeContentHtml } = ctx;


  app.get('/api/audit', requireOrg, async (req, res, next) => {
    try { res.json(await storage.audit.list(req.org.id)); } catch (e) { next(e); }
  });

  app.get('/api/library', requireOrg, async (req, res, next) => {
    try { res.json(await storage.library.list(req.org.id)); } catch (e) { next(e); }
  });

  app.post('/api/library', requireOrg, requirePermission('library', 'edit'), async (req, res, next) => {
    try {
      const entries = req.body;
      if (!Array.isArray(entries)) return res.status(400).json({ error: 'Invalid library data structure' });
      const clean = entries.map(e => ({ ...e, html: sanitizeContentHtml(e?.html || '') }));
      const written = await storage.library.bulkReplace(req.org.id, clean);
      res.json({ success: true, library: written });
    } catch (e) { next(e); }
  });

}
