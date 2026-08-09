// Workspace roles API — the backend for the Role Editor.
//
// System roles (viewer/editor/admin) are computed, not stored (see
// src/shared/permissions.js); they're returned read-only alongside the
// workspace's custom roles. Creating/editing/deleting roles is an owner-only
// action (requireRole('admin')), independent of the per-page 'team' permission,
// so a delegated team-manager can't quietly grant itself more power.

import {
  SYSTEM_ROLES, isSystemRole, defaultPermissionsForSystemRole, sanitizePermissions,
} from '../../src/shared/permissions.js';

const slugify = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The system roles as API rows, so the client renders them (read-only) in the
// same list as custom roles.
const systemRoleRows = () => SYSTEM_ROLES.map((id) => ({
  id, name: titleCase(id), is_system: true,
  permissions: defaultPermissionsForSystemRole(id),
}));

export function registerRoleRoutes(app, ctx) {
  const { storage, requireOrg, requireRole, auditFor } = ctx;

  app.get('/api/roles', requireOrg, async (req, res, next) => {
    try {
      const custom = await storage.roles.listForOrg(req.org.id).catch(() => []);
      res.json({ roles: [...systemRoleRows(), ...custom.filter((r) => !r.is_system)] });
    } catch (e) { next(e); }
  });

  // Create (no id) or rename/repermission an existing custom role (id in body).
  const upsert = async (req, res, next) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'A role name is required' });

      let id = req.body?.id ? slugify(req.body.id) : slugify(name);
      if (!id) return res.status(400).json({ error: 'That name has no usable letters or numbers' });
      if (isSystemRole(id)) return res.status(400).json({ error: `"${id}" is a built-in role and can't be edited` });

      // On create, don't silently overwrite an existing custom role of the
      // same slug.
      if (!req.body?.id) {
        const existing = await storage.roles.get(req.org.id, id).catch(() => null);
        if (existing) return res.status(409).json({ error: `A role called "${name}" already exists` });
      }

      const permissions = sanitizePermissions(req.body?.permissions);
      const row = await storage.roles.upsert(req.org.id, { id, name, permissions });
      await auditFor(req.org.id, req.viewer)(req.body?.id ? 'Updated role' : 'Created role', `${name} (${id})`);
      res.json({ role: row });
    } catch (e) { next(e); }
  };

  app.post('/api/roles', requireOrg, requireRole('admin'), upsert);
  app.patch('/api/roles/:id', requireOrg, requireRole('admin'), (req, res, next) => {
    req.body = { ...req.body, id: req.params.id };
    return upsert(req, res, next);
  });

  app.delete('/api/roles/:id', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const id = req.params.id;
      if (isSystemRole(id)) return res.status(400).json({ error: 'Built-in roles cannot be deleted' });
      const inUse = await storage.roles.membersUsing(req.org.id, id);
      if (inUse > 0) {
        return res.status(409).json({ error: `${inUse} member${inUse === 1 ? '' : 's'} still ${inUse === 1 ? 'has' : 'have'} this role. Reassign them first.` });
      }
      await storage.roles.remove(req.org.id, id);
      await auditFor(req.org.id, req.viewer)('Deleted role', id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });
}
