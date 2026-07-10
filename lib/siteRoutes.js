// Staging → live controls + demo-mode settings. Mounted by server.js via
// mountSiteApi(app). All operational + demo state lives in orgs.feature_flags
// (see migration 028); the deployment snapshots live in site_deployments.

import { requireRole } from './auth.js';
import * as storage from './storage.js';
import * as deployments from './deployments.js';

const requireOrg = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!req.org) return res.status(403).json({ error: 'No workspace on this account' });
  if (req.org.paused) return res.status(423).json({ error: 'Something went wrong. Please contact support.' });
  next();
};

// Merge a patch into the org's feature_flags without clobbering siblings.
async function patchFlags(orgId, patch) {
  const org = await storage.orgs.get(orgId);
  const featureFlags = { ...(org?.feature_flags || {}), ...patch };
  await storage.orgs.update(orgId, { featureFlags });
  return featureFlags;
}

async function buildStatus(orgId, flags) {
  const ff = flags || (await storage.orgs.get(orgId))?.feature_flags || {};
  const meta = await deployments.latestMeta(orgId);
  let hasUndeployedChanges = false;
  if (ff.staging_enabled) {
    const [pages, settings] = await Promise.all([storage.pages.list(orgId), storage.settings.get(orgId)]);
    const workingHash = deployments.contentHash(pages, settings);
    hasUndeployedChanges = !meta || meta.contentHash !== workingHash;
  }
  return {
    stagingEnabled: !!ff.staging_enabled,
    live: !!ff.site_live,
    demoMode: !!ff.demo_mode,
    comingSoon: Array.isArray(ff.coming_soon) ? ff.coming_soon : [],
    lastDeployedAt: meta?.deployedAt || null,
    hasUndeployedChanges,
  };
}

export function mountSiteApi(app) {
  app.get('/api/site/status', requireOrg, async (req, res, next) => {
    try { res.json(await buildStatus(req.org.id, req.org.feature_flags)); }
    catch (e) { next(e); }
  });

  // Promote the working copy to live. Requires admin — going public is a big
  // action. Also flips site_live on (Deploy implies "live").
  app.post('/api/site/deploy', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.org.id;
      const [pages, library, settings] = await Promise.all([
        storage.pages.list(orgId), storage.library.list(orgId), storage.settings.get(orgId),
      ]);
      const { id, contentHash } = await deployments.deploy(orgId, { pages, library, settings, deployedBy: req.viewer.email });
      await deployments.prune(orgId);
      const flags = await patchFlags(orgId, { staging_enabled: true, site_live: true });
      await storage.audit.append(orgId, 'Deployed site', `snapshot ${id}`, req.viewer.email).catch(() => {});
      res.json({ success: true, deploymentId: id, contentHash, status: await buildStatus(orgId, flags) });
    } catch (e) { next(e); }
  });

  // Take the public site offline (keeps the last snapshot for a later Deploy).
  app.post('/api/site/undeploy', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const flags = await patchFlags(req.org.id, { site_live: false });
      await storage.audit.append(req.org.id, 'Took site offline', null, req.viewer.email).catch(() => {});
      res.json({ success: true, status: await buildStatus(req.org.id, flags) });
    } catch (e) { next(e); }
  });

  // Staging + demo-mode settings (the "settings button"). Enable/disable the
  // UAT model, demo mode, and which feature keys are badged "Coming soon".
  app.patch('/api/site/settings', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const patch = {};
      if (req.body.stagingEnabled !== undefined) patch.staging_enabled = !!req.body.stagingEnabled;
      if (req.body.demoMode !== undefined) patch.demo_mode = !!req.body.demoMode;
      if (Array.isArray(req.body.comingSoon)) patch.coming_soon = req.body.comingSoon.map(String).slice(0, 50);
      const flags = await patchFlags(req.org.id, patch);
      res.json({ success: true, status: await buildStatus(req.org.id, flags) });
    } catch (e) { next(e); }
  });
}
