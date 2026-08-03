// Page version history: list the snapshots taken on every save, and restore one.
//
// Extracted from server.js, which had grown past 1,500 lines of routing,
// auth, rendering, uploads and CSP in one file. Behaviour is unchanged: the
// handlers below are the same code, moved. Shared helpers arrive through
// `ctx` rather than closing over module scope, which is what makes the move
// possible without threading globals — the same pattern lib/collectionsRoutes.js
// already used.

export function registerVersionRoutes(app, ctx) {
  const { storage, requireOrg, requireRole, auditFor } = ctx;


  app.get('/api/versions/:pageId', requireOrg, async (req, res, next) => {
    try { res.json(await storage.versions.listForPage(req.org.id, req.params.pageId)); }
    catch (e) { next(e); }
  });

  app.post('/api/versions/:pageId/:versionId/restore', requireOrg, requireRole('editor'), async (req, res, next) => {
    try {
      const version = await storage.versions.get(req.org.id, req.params.pageId, req.params.versionId);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      const pages = await storage.pages.list(req.org.id);
      const targetIndex = pages.findIndex(p => p.id === req.params.pageId);
      if (targetIndex === -1) return res.status(404).json({ error: 'Page no longer exists' });
      const next = pages.map((p, i) => i === targetIndex ? version.snapshot : p);
      await storage.versions.snapshot(req.org.id, pages, next);
      const written = await storage.pages.bulkReplace(req.org.id, next);
      await auditFor(req.org.id, req.viewer)('Restored version', `Page "${version.snapshot.name}" restored from ${new Date(version.timestamp).toLocaleString()}`);
      res.json({ success: true, pages: written });
    } catch (e) { next(e); }
  });

}
