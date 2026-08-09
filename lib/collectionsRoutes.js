// REST surface for content collections. Mounted in server.js.
//
// Editing the SHAPE of a collection (its fields, its detail-page settings) is
// an admin action: it rewrites every entry through the new field list and can
// change what URLs the public site serves. Editing ENTRIES is ordinary
// content work, so it only needs the editor role — same split the rest of the
// CMS uses.

import * as collections from './collections.js';

export function registerCollectionRoutes(app, { requireOrg, requirePermission, auditFor }) {
  // ---- Collections -------------------------------------------------------

  app.get('/api/collections', requireOrg, async (req, res, next) => {
    try {
      res.json({ collections: await collections.list(req.org.id) });
    } catch (e) { next(e); }
  });

  app.post('/api/collections', requireOrg, requirePermission('collections', 'edit', 'manage'), async (req, res, next) => {
    try {
      const created = await collections.create(req.org.id, req.body);
      await auditFor(req.org.id, req.viewer)('Created collection', created.name);
      res.json({ collection: created });
    } catch (e) { next(e); }
  });

  app.patch('/api/collections/:id', requireOrg, requirePermission('collections', 'edit', 'manage'), async (req, res, next) => {
    try {
      const updated = await collections.update(req.org.id, req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Collection not found' });
      await auditFor(req.org.id, req.viewer)('Updated collection', updated.name);
      res.json({ collection: updated });
    } catch (e) { next(e); }
  });

  app.delete('/api/collections/:id', requireOrg, requirePermission('collections', 'edit', 'manage'), async (req, res, next) => {
    try {
      const existing = await collections.get(req.org.id, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Collection not found' });
      await collections.remove(req.org.id, req.params.id);
      // Worth spelling out in the audit trail: this took the entries too.
      await auditFor(req.org.id, req.viewer)('Deleted collection', `${existing.name} (and all its entries)`);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // ---- Entries -----------------------------------------------------------

  app.get('/api/collections/:id/entries', requireOrg, async (req, res, next) => {
    try {
      const collection = await collections.get(req.org.id, req.params.id);
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      res.json({ collection, entries: await collections.listEntries(req.org.id, collection.id) });
    } catch (e) { next(e); }
  });

  app.post('/api/collections/:id/entries', requireOrg, requirePermission('collections', 'edit'), async (req, res, next) => {
    try {
      const entry = await collections.createEntry(req.org.id, req.params.id, req.body);
      res.json({ entry });
    } catch (e) {
      // A missing required field is the author's problem to fix, not a 500.
      if (/Missing required field/.test(e.message)) return res.status(400).json({ error: e.message });
      if (/Collection not found/.test(e.message)) return res.status(404).json({ error: e.message });
      next(e);
    }
  });

  app.patch('/api/collections/entries/:entryId', requireOrg, requirePermission('collections', 'edit'), async (req, res, next) => {
    try {
      const entry = await collections.updateEntry(req.org.id, req.params.entryId, req.body);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json({ entry });
    } catch (e) {
      if (/Missing required field/.test(e.message)) return res.status(400).json({ error: e.message });
      next(e);
    }
  });

  app.delete('/api/collections/entries/:entryId', requireOrg, requirePermission('collections', 'edit'), async (req, res, next) => {
    try {
      await collections.removeEntry(req.org.id, req.params.entryId);
      res.json({ success: true });
    } catch (e) { next(e); }
  });
}
