// Routes for the "Add Block +" catalog (see lib/blockCatalog.js for the
// platform-wide-vs-workspace-owned split). Permission depends on which
// entry is being touched, not just who's asking, so these use inline
// checks rather than a single composable gate:
//   - Platform-wide entries (org_id null): Super Admin only.
//   - A workspace's own entries: that workspace's own editors/admins.

import * as blockCatalog from './blockCatalog.js';
import { ROLE_RANK, isSuperAdminViewer } from './auth.js';

// Deliberately NOT requireOrg -- a pure super-admin operating from
// /super-admin (no workspace context at all) still needs to manage the
// platform-wide catalog, which has nothing to do with any org membership.
const requireAuth = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  next();
};

const isEditor = (req) => (ROLE_RANK[req.viewer?.role] ?? 0) >= ROLE_RANK.editor;

// Can this viewer write to this catalog entry (or a new entry with this
// target orgId)? Platform-wide (null) needs super-admin; a workspace's own
// needs that workspace's own editor+ role, and must actually be their org.
function canWrite(req, targetOrgId) {
  if (!targetOrgId) return isSuperAdminViewer(req.viewer);
  return req.org?.id === targetOrgId && isEditor(req);
}

export function mountBlockCatalogApi(app) {
  app.get('/api/block-catalog', requireAuth, async (req, res, next) => {
    try {
      if (!req.org && !isSuperAdminViewer(req.viewer)) {
        return res.status(403).json({ error: 'No workspace on this account' });
      }
      res.json(await blockCatalog.list(req.org?.id));
    } catch (e) { next(e); }
  });

  app.post('/api/block-catalog', requireAuth, async (req, res, next) => {
    try {
      const { orgId, blockType, name, category, description, defaultFields } = req.body || {};
      if (orgId && !req.org) return res.status(400).json({ error: 'No workspace on this account' });
      const targetOrgId = orgId ? req.org.id : null; // client only chooses "mine" vs "platform", never an arbitrary org
      if (!canWrite(req, targetOrgId)) return res.status(403).json({ error: 'Not allowed to add a block here' });
      if (!blockType || !name || !category) return res.status(400).json({ error: 'blockType, name, and category are required' });
      const id = `${targetOrgId || 'platform'}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const entry = await blockCatalog.create({
        id, orgId: targetOrgId, blockType, name, category,
        description: description || '', defaultFields: defaultFields || {},
      });
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.patch('/api/block-catalog/:id', requireAuth, async (req, res, next) => {
    try {
      const existing = await blockCatalog.get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Block not found' });
      if (!canWrite(req, existing.orgId)) return res.status(403).json({ error: 'Not allowed to edit this block' });
      const entry = await blockCatalog.update(req.params.id, req.body || {});
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.delete('/api/block-catalog/:id', requireAuth, async (req, res, next) => {
    try {
      const existing = await blockCatalog.get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Block not found' });
      if (!canWrite(req, existing.orgId)) return res.status(403).json({ error: 'Not allowed to remove this block' });
      await blockCatalog.remove(req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });
}
