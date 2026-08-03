// A/B impression and click tracking, and the stats the editor reads back.
//
// Extracted from server.js, which had grown past 1,500 lines of routing,
// auth, rendering, uploads and CSP in one file. Behaviour is unchanged: the
// handlers below are the same code, moved. Shared helpers arrive through
// `ctx` rather than closing over module scope, which is what makes the move
// possible without threading globals — the same pattern lib/collectionsRoutes.js
// already used.

export function registerAbRoutes(app, ctx) {
  const { storage, requireOrg, abTrackLimit } = ctx;


  app.post('/api/ab-track', abTrackLimit, requireOrg, async (req, res, next) => {
    try {
      const { sectionId, variantId, event } = req.body;
      if (!sectionId || !variantId || event !== 'click') {
        return res.status(400).json({ error: 'sectionId, variantId, and event="click" are required' });
      }
      await storage.abStats.record(req.org.id, sectionId, variantId, 'clicks');
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.get('/api/ab-stats/:sectionId', requireOrg, async (req, res, next) => {
    try { res.json(await storage.abStats.forSection(req.org.id, req.params.sectionId)); } catch (e) { next(e); }
  });

}
