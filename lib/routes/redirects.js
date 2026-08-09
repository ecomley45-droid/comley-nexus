// URL redirects, applied by the public router before it looks for a page.
//
// Extracted from server.js, which had grown past 1,500 lines of routing,
// auth, rendering, uploads and CSP in one file. Behaviour is unchanged: the
// handlers below are the same code, moved. Shared helpers arrive through
// `ctx` rather than closing over module scope, which is what makes the move
// possible without threading globals — the same pattern lib/collectionsRoutes.js
// already used.

export function registerRedirectRoutes(app, ctx) {
  const { storage, requireOrg, requirePermission, auditFor } = ctx;


  app.get('/api/redirects', requireOrg, async (req, res, next) => {
    try { res.json(await storage.redirects.list(req.org.id)); } catch (e) { next(e); }
  });

  app.post('/api/redirects', requireOrg, requirePermission('redirects', 'edit'), async (req, res, next) => {
    try {
      const { from, to, type } = req.body;
      const cleanFrom = String(from ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const cleanTo = (to || '').trim();
      if (!cleanFrom || !cleanTo) return res.status(400).json({ error: 'from and to are required' });
      const existing = await storage.redirects.getByFrom(req.org.id, cleanFrom);
      if (existing) return res.status(400).json({ error: `A redirect from "/${cleanFrom}" already exists.` });
      const entry = { id: 'redir-' + Date.now(), from: cleanFrom, to: cleanTo, type: Number(type) === 301 ? 301 : 302 };
      await storage.redirects.add(req.org.id, entry);
      await auditFor(req.org.id, req.viewer)('Added redirect', `/${cleanFrom} -> ${cleanTo}`);
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.delete('/api/redirects/:id', requireOrg, requirePermission('redirects', 'edit'), async (req, res, next) => {
    try {
      const removed = await storage.redirects.remove(req.org.id, req.params.id);
      if (!removed) return res.status(404).json({ error: 'Redirect not found' });
      await auditFor(req.org.id, req.viewer)('Deleted redirect', `/${removed.from} -> ${removed.to}`);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

}
