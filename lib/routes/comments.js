// Per-block review comments used by the page editor's Content panel.
//
// Extracted from server.js, which had grown past 1,500 lines of routing,
// auth, rendering, uploads and CSP in one file. Behaviour is unchanged: the
// handlers below are the same code, moved. Shared helpers arrive through
// `ctx` rather than closing over module scope, which is what makes the move
// possible without threading globals — the same pattern lib/collectionsRoutes.js
// already used.

export function registerCommentRoutes(app, ctx) {
  const { storage, requireOrg, requirePermission } = ctx;


  app.get('/api/comments', requireOrg, async (req, res, next) => {
    try { res.json(await storage.comments.list(req.org.id, req.query.pageId)); } catch (e) { next(e); }
  });

  app.post('/api/comments', requireOrg, requirePermission('comments', 'edit'), async (req, res, next) => {
    try {
      const { pageId, sectionId, text, author } = req.body;
      if (!pageId || !sectionId || !text?.trim()) return res.status(400).json({ error: 'pageId, sectionId, and text are required' });
      const entry = await storage.comments.add(req.org.id, {
        id: 'comment-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        pageId, sectionId, text: text.trim(),
        author: author || req.viewer?.email || 'anonymous',
      });
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.patch('/api/comments/:id', requireOrg, requirePermission('comments', 'edit'), async (req, res, next) => {
    try {
      const entry = await storage.comments.setResolved(req.org.id, req.params.id, !!req.body.resolved);
      if (!entry) return res.status(404).json({ error: 'Comment not found' });
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.delete('/api/comments/:id', requireOrg, requirePermission('comments', 'edit'), async (req, res, next) => {
    try { await storage.comments.remove(req.org.id, req.params.id); res.json({ success: true }); }
    catch (e) { next(e); }
  });

}
