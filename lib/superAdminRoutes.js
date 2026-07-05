// Super-admin-only cross-workspace operations that don't belong in
// lib/nexusRoutes.js (Nexus's own site content) or the /api/orgs* routes
// in server.js (org CRUD). Currently just the "view as" workspace switch --
// see lib/auth.js's VIEW_AS_COOKIE comment for why this is a cookie
// override rather than a real org_members row.

import * as storage from './storage.js';
import { requireSuperAdmin, VIEW_AS_COOKIE } from './auth.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 4 * 60 * 60 * 1000, // 4 hours
};

export function mountSuperAdminApi(app) {
  app.post('/api/super-admin/view-as/:orgId', requireSuperAdmin, async (req, res, next) => {
    try {
      const org = await storage.orgs.get(req.params.orgId);
      if (!org) return res.status(404).json({ error: 'Workspace not found' });
      res.cookie(VIEW_AS_COOKIE, org.id, COOKIE_OPTIONS);
      await storage.audit.append(org.id, 'Super admin viewed workspace', `Viewed by ${req.viewer.email}`, req.viewer.email).catch(() => {});
      res.json({ success: true, org: { id: org.id, name: org.name } });
    } catch (e) { next(e); }
  });

  app.post('/api/super-admin/view-as/clear', requireSuperAdmin, async (req, res) => {
    res.clearCookie(VIEW_AS_COOKIE);
    res.json({ success: true });
  });
}
