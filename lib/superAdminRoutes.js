// Super-admin-only cross-workspace operations that don't belong in
// lib/nexusRoutes.js (Nexus's own site content) or the /api/orgs* routes
// in server.js (org CRUD). Currently just the "view as" workspace switch --
// see lib/auth.js's VIEW_AS_COOKIE comment for why this is a cookie
// override rather than a real org_members row.

import * as storage from './storage.js';
import { requireSuperAdmin, VIEW_AS_COOKIE, ROLE_RANK } from './auth.js';

export const VIEW_AS_COOKIE_OPTIONS = {
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
      // role is optional (defaults to 'admin', the pre-existing behavior) --
      // see VIEW_AS_COOKIE's own comment for the JSON shape.
      const role = ROLE_RANK.hasOwnProperty(req.body?.role) ? req.body.role : 'admin';
      res.cookie(VIEW_AS_COOKIE, JSON.stringify({ org: org.id, role }), VIEW_AS_COOKIE_OPTIONS);
      // Deliberately no audit_log entry here -- a client's own team must
      // never see any trace of Super Admin having opened their workspace,
      // in the audit log, recent activity, or anywhere else client-facing.
      // (Nexus Command-issued view-as grants ARE audited, in Core -- see
      // lib/viewAsHandoff.js's header for why that's a different case.)
      res.json({ success: true, org: { id: org.id, name: org.name }, role });
    } catch (e) { next(e); }
  });

  app.post('/api/super-admin/view-as/clear', requireSuperAdmin, async (req, res) => {
    res.clearCookie(VIEW_AS_COOKIE);
    res.json({ success: true });
  });
}
