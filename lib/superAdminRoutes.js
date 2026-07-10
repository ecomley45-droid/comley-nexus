// Super-admin-only cross-workspace operations that don't belong in
// lib/nexusRoutes.js (Nexus's own site content) or the /api/orgs* routes
// in server.js (org CRUD). Currently just the "view as" workspace switch --
// see lib/auth.js's VIEW_AS_COOKIE comment for why this is a cookie
// override rather than a real org_members row.

import * as storage from './storage.js';
import { requireSuperAdmin, VIEW_AS_COOKIE } from './auth.js';
import { seedDemoWorkspace } from './demoSeed.js';

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
      // Deliberately no audit_log entry here -- a client's own team must
      // never see any trace of Super Admin having opened their workspace,
      // in the audit log, recent activity, or anywhere else client-facing.
      res.json({ success: true, org: { id: org.id, name: org.name } });
    } catch (e) { next(e); }
  });

  app.post('/api/super-admin/view-as/clear', requireSuperAdmin, async (req, res) => {
    res.clearCookie(VIEW_AS_COOKIE);
    res.json({ success: true });
  });

  // Create (or reset) the demo workspace — a fully populated, deployed site
  // used for presentations. Reset wipes the existing demo org first, so this
  // is a "refresh to pristine demo state" button too.
  app.post('/api/super-admin/demo-workspace', requireSuperAdmin, async (req, res, next) => {
    try {
      const result = await seedDemoWorkspace({ ownerEmail: req.viewer.email, reset: req.body?.reset !== false });
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });
}
