// Routes for the site-template marketplace + whole-site backups/restore.
//
//   Browse/install (workspace, org-scoped):
//     GET  /api/templates                 list (any signed-in viewer; org's
//                                          own private templates included)
//     GET  /api/templates/:id             one template, full payload + summary
//     POST /api/templates/:id/install     admin only; replaces the site,
//                                          auto-backs-up first
//     GET  /api/template-installs         this workspace's install history
//
//   Backups (workspace, admin only):
//     GET  /api/backups                   list restore points
//     POST /api/backups                   manual "Back up now"
//     POST /api/backups/:id/restore       roll the whole site back
//     DELETE /api/backups/:id             delete a restore point
//
//   Authoring (platform, Super Admin only):
//     POST   /api/templates               create a platform template
//     PATCH  /api/templates/:id           edit
//     DELETE /api/templates/:id           soft-delete
//     POST   /api/templates/from-site     capture the current workspace's
//                                          live site as a new template
//
// Install is the same three-step sequence POST /api/pages already uses
// (snapshot -> bulkReplace -> settings.replace), seeded from a template's
// payload instead of the editor, and preceded by a full-site backup.

import * as storage from './storage.js';
import * as backups from './backupsStore.js';
import * as templates from './siteTemplateStore.js';
import { materializeInstall, validateSitePayload, summarizePayload } from './sitePayload.js';
import { requireRole, isSuperAdminViewer } from './auth.js';
import { sanitizePage, sanitizeGlobalSettings } from './sanitize.js';

const BACKUP_RETENTION = 10;

const requireAuth = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  next();
};

// Mirrors server.js's own requireOrg (not exported there): auth + a real,
// non-paused workspace on the account.
const requireOrg = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!req.org) return res.status(403).json({ error: 'No workspace on this account' });
  if (req.org.paused) return res.status(423).json({ error: 'Something went wrong. Please contact support.' });
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!isSuperAdminViewer(req.viewer)) return res.status(403).json({ error: 'Super-admin required' });
  next();
};

// Trim a template to a light list item: keep the index page's sections +
// theme so cards can render a live mini-preview, plus a block/page summary,
// but drop the rest of the payload to keep the list response small.
function toListItem(t) {
  const pages = t.payload?.pages || [];
  const home = pages.find((p) => p.slug === 'index') || pages[0] || { sections: [] };
  return {
    id: t.id, slug: t.slug, name: t.name, category: t.category,
    description: t.description, featureList: t.featureList, scope: t.scope,
    theme: t.payload?.theme || {},
    previewSections: home.sections || [],
    previewFullHtml: home.editorMode === 'full-html' ? home.fullHtml : null,
    summary: summarizePayload(t.payload),
  };
}

// Snapshot the workspace's current site into a backup row + prune. Returns
// the new backup id. Shared by install and by the manual backup route.
async function backupCurrentSite(orgId, { label, reason }) {
  const [pages, settings] = await Promise.all([
    storage.pages.list(orgId),
    storage.settings.get(orgId),
  ]);
  const id = await backups.create(orgId, { label, reason, pages, settings });
  await backups.prune(orgId, BACKUP_RETENTION);
  return id;
}

export function mountMarketplaceApi(app) {
  const auditFor = (req, action, details) =>
    storage.audit.append(req.org.id, action, details, req.viewer?.email || null)
      .catch((e) => console.error('[audit]', e.message));

  // ---------- Authoring (Super Admin) ----------
  // Registered before the parameterized routes so /from-site can't be
  // shadowed, and kept above install so intent is clear.
  app.post('/api/templates/from-site', requireOrg, requireSuperAdmin, async (req, res, next) => {
    try {
      const { name, category, description, featureList, slug } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
      const [pages, settings] = await Promise.all([
        storage.pages.list(req.org.id),
        storage.settings.get(req.org.id),
      ]);
      // Strip live pages down to the fields-level payload; raw-HTML and
      // full-HTML sections (no blockType/fields) are dropped by validation.
      const payload = validateSitePayload({
        theme: settings.theme || {},
        pages: pages.map((p) => (p.editorMode === 'full-html' && p.fullHtml
          ? { name: p.name, slug: p.slug, editorMode: 'full-html', fullHtml: p.fullHtml }
          : {
              name: p.name, slug: p.slug,
              sections: (p.content || []).map((s) => ({ name: s.name, blockType: s.blockType, fields: s.fields })),
            })),
      });
      if (payload.pages.length === 0) {
        return res.status(400).json({ error: 'This site has no block-based pages to capture as a template.' });
      }
      const id = `tpl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const created = await templates.create({
        id, orgId: null, slug: slug?.trim() || id, name: name.trim(),
        category: category?.trim() || 'Business', description: description || '',
        featureList: Array.isArray(featureList) ? featureList : [], payload,
      });
      res.json({ success: true, template: created });
    } catch (e) { next(e); }
  });

  app.post('/api/templates', requireSuperAdmin, async (req, res, next) => {
    try {
      const { name, category, description, featureList, payload, slug } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
      const cleaned = validateSitePayload(payload);
      if (cleaned.pages.length === 0) return res.status(400).json({ error: 'payload must contain at least one valid page' });
      const id = `tpl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const created = await templates.create({
        id, orgId: null, slug: slug?.trim() || id, name: name.trim(),
        category: category?.trim() || 'Business', description: description || '',
        featureList: Array.isArray(featureList) ? featureList : [], payload: cleaned,
      });
      res.json({ success: true, template: created });
    } catch (e) { next(e); }
  });

  app.patch('/api/templates/:id', requireSuperAdmin, async (req, res, next) => {
    try {
      const existing = await templates.get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      if (existing.scope !== 'platform') return res.status(403).json({ error: 'Only platform templates are editable here' });
      const updated = await templates.update(req.params.id, req.body || {});
      res.json({ success: true, template: updated });
    } catch (e) { next(e); }
  });

  app.delete('/api/templates/:id', requireSuperAdmin, async (req, res, next) => {
    try {
      const existing = await templates.get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      await templates.remove(req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // ---------- Browse (any signed-in viewer; org context optional) ----------
  app.get('/api/templates', requireAuth, async (req, res, next) => {
    try {
      const list = await templates.list(req.org?.id);
      res.json({ templates: list.map(toListItem) });
    } catch (e) { next(e); }
  });

  app.get('/api/templates/:id', requireAuth, async (req, res, next) => {
    try {
      const t = await templates.get(req.params.id);
      if (!t || !t.isActive) return res.status(404).json({ error: 'Template not found' });
      // A workspace-private template is only visible to its own org.
      if (t.scope === 'workspace' && t.orgId !== req.org?.id) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json({
        template: {
          id: t.id, slug: t.slug, name: t.name, category: t.category,
          description: t.description, featureList: t.featureList, scope: t.scope,
          payload: t.payload, summary: summarizePayload(t.payload),
        },
      });
    } catch (e) { next(e); }
  });

  // ---------- Install (admin only; destructive, auto-backed-up) ----------
  app.post('/api/templates/:id/install', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const t = await templates.get(req.params.id);
      if (!t || !t.isActive) return res.status(404).json({ error: 'Template not found' });
      if (t.scope === 'workspace' && t.orgId !== req.org.id) return res.status(404).json({ error: 'Template not found' });

      const applyTheme = req.body?.applyTheme !== false; // default: apply the template's theme
      const materialized = materializeInstall(t.payload);
      if (materialized.pages.length === 0) return res.status(400).json({ error: 'This template has no installable pages.' });

      // 1. Snapshot the current site FIRST so the install is fully undoable.
      const backupId = await backupCurrentSite(req.org.id, {
        label: `Before installing “${t.name}”`, reason: 'pre-install',
      });

      // 2. Replace the site's pages with the template's.
      const cleanPages = materialized.pages.map(sanitizePage);
      await storage.pages.bulkReplace(req.org.id, cleanPages);

      // 3. Optionally apply the template's theme (keeps everything else in
      //    global_settings -- siteName, analytics, globals -- untouched).
      if (applyTheme) {
        const settings = await storage.settings.get(req.org.id);
        await storage.settings.replace(req.org.id, sanitizeGlobalSettings({ ...settings, theme: materialized.theme }));
      }

      await templates.installs.record(req.org.id, {
        templateId: t.id, templateName: t.name, installedBy: req.viewer?.email || null,
        backupId, appliedTheme: applyTheme,
      });
      await auditFor(req, 'Installed template', `${t.name} (${cleanPages.length} pages${applyTheme ? ', theme applied' : ''})`);
      res.json({ success: true, backupId, pageCount: cleanPages.length, appliedTheme: applyTheme });
    } catch (e) { next(e); }
  });

  app.get('/api/template-installs', requireOrg, async (req, res, next) => {
    try {
      const [history, backupList] = await Promise.all([
        templates.installs.listForOrg(req.org.id),
        backups.list(req.org.id),
      ]);
      const liveBackupIds = new Set(backupList.map((b) => b.id));
      // Flag whether each install's pre-install backup still exists (it may
      // have been pruned), so the UI only offers "restore" when it can work.
      res.json({ installs: history.map((h) => ({ ...h, backupAvailable: !!h.backupId && liveBackupIds.has(h.backupId) })) });
    } catch (e) { next(e); }
  });

  // ---------- Backups / restore (admin only) ----------
  app.get('/api/backups', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      res.json({ backups: await backups.list(req.org.id) });
    } catch (e) { next(e); }
  });

  app.post('/api/backups', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const label = String(req.body?.label || '').slice(0, 120) || `Manual backup · ${new Date().toLocaleString()}`;
      const id = await backupCurrentSite(req.org.id, { label, reason: 'manual' });
      await auditFor(req, 'Created site backup', label);
      res.json({ success: true, id });
    } catch (e) { next(e); }
  });

  app.post('/api/backups/:id/restore', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const backup = await backups.get(req.org.id, req.params.id);
      if (!backup) return res.status(404).json({ error: 'Backup not found' });

      // Safety net: back up the CURRENT state before overwriting it, so a
      // restore is itself reversible.
      await backupCurrentSite(req.org.id, {
        label: `Before restoring “${backup.label}”`, reason: 'pre-restore',
      });

      const restoredPages = (backup.pages || []).map(sanitizePage);
      await storage.pages.bulkReplace(req.org.id, restoredPages);
      if (backup.settings && Object.keys(backup.settings).length > 0) {
        await storage.settings.replace(req.org.id, sanitizeGlobalSettings(backup.settings));
      }
      await auditFor(req, 'Restored site backup', `${backup.label} (${restoredPages.length} pages)`);
      res.json({ success: true, pageCount: restoredPages.length });
    } catch (e) { next(e); }
  });

  app.delete('/api/backups/:id', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      await backups.remove(req.org.id, req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });
}
