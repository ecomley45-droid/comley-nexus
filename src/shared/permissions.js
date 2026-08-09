// Permission registry — the single source of truth for workspace RBAC,
// shared by client (nav gating, Role Editor UI) and server (requirePermission).
// Lives in src/shared like compilePage.js so both `lib/` + `server.js` and the
// React app import the SAME can()/registry, and a validator and a policy can
// never drift.
//
// The model: a role's `permissions` is an object keyed by page:
//   { pages: { view: true, edit: true, features: { publish: true } }, ... }
// A page a role doesn't list is denied. The `__full: true` sentinel is an
// all-access shortcut used by the immutable `admin` system role and by
// platform super-admins.
//
// Only WRITE routes are gated server-side (reads were never role-gated), so
// `edit` (optionally + a feature) is the real security boundary; `view`
// governs nav visibility on the client.

// Named roles that are computed, not stored. `admin` is the immutable owner
// tier (always full access, manages roles + billing — you can't lock yourself
// out). `editor`/`viewer` are editable starting points; a workspace can also
// define any number of custom roles alongside them.
export const SYSTEM_ROLES = ['admin', 'editor', 'viewer'];
export const isSystemRole = (slug) => SYSTEM_ROLES.includes(slug);

// Every gated page, grouped to mirror the CMS nav (CmsLayout NAV_ITEMS).
// `key` matches the nav item's pageKey; `features` are the sub-features a role
// can be granted on that page. Enforced features are the ones that map to a
// previously stricter (admin-only) gate; the rest are UI toggles the server
// will harden over time (see requirePermission call sites).
export const PAGES = [
  // --- Content ---
  { key: 'pages', label: 'Pages', group: 'Content', features: [
    { key: 'publish', label: 'Publish / unpublish' },
    { key: 'delete', label: 'Delete pages' },
  ] },
  { key: 'collections', label: 'Collections', group: 'Content', features: [
    { key: 'manage', label: 'Create & delete collections' },
  ] },
  { key: 'events', label: 'Events', group: 'Content', features: [] },
  { key: 'media', label: 'Media', group: 'Content', features: [
    { key: 'delete', label: 'Delete media' },
  ] },
  { key: 'forms', label: 'Form responses', group: 'Content', features: [] },
  { key: 'comments', label: 'Comments', group: 'Content', features: [] },

  // --- Design ---
  { key: 'templates', label: 'Site templates', group: 'Design', features: [
    { key: 'install', label: 'Install a template' },
  ] },
  { key: 'blocks', label: 'Block catalog', group: 'Design', features: [] },
  { key: 'library', label: 'Saved sections', group: 'Design', features: [] },
  { key: 'design', label: 'Theme & branding', group: 'Design', features: [] },

  // --- Marketing ---
  { key: 'email', label: 'Newsletter', group: 'Marketing', features: [
    { key: 'send', label: 'Send campaigns' },
  ] },
  { key: 'social', label: 'Social', group: 'Marketing', features: [
    { key: 'accounts', label: 'Connect / disconnect accounts' },
  ] },

  // --- Settings ---
  { key: 'workspace', label: 'Workspace settings', group: 'Settings', features: [] },
  { key: 'team', label: 'Team & permissions', group: 'Settings', features: [] },
  { key: 'connections', label: 'Integrations', group: 'Settings', features: [] },
  { key: 'redirects', label: 'Redirects', group: 'Settings', features: [] },
  { key: 'backups', label: 'Backups', group: 'Settings', features: [] },
  { key: 'billing', label: 'Billing', group: 'Settings', features: [] },
  { key: 'audit', label: 'Audit log', group: 'Settings', features: [] },

  // --- Ops ---
  { key: 'feedback', label: 'Feedback inbox', group: 'Ops', features: [] },

  // --- Commerce (also feature-flagged per workspace) ---
  { key: 'commerce', label: 'Commerce', group: 'Commerce', features: [] },
];

export const PAGE_KEYS = PAGES.map((p) => p.key);
export const pageDef = (key) => PAGES.find((p) => p.key === key) || null;

// The one authorization function both layers call.
//   can(perms, 'pages')                 -> may the role see the Pages nav item?
//   can(perms, 'pages', 'edit')         -> may it write pages?
//   can(perms, 'social', 'edit', 'accounts') -> edit AND the accounts feature.
// `edit` implies `view`.
export function can(permissions, pageKey, action = 'view', featureKey = null) {
  if (!permissions) return false;
  if (permissions.__full) return true;
  const p = permissions[pageKey];
  if (!p) return false;
  const base = action === 'edit' ? !!p.edit : (!!p.view || !!p.edit);
  if (!base) return false;
  if (featureKey) return !!(p.features && p.features[featureKey]);
  return true;
}

// A blank matrix with every page present and everything off — the starting
// point the Role Editor renders for a brand-new custom role.
export function emptyPermissions() {
  const out = {};
  for (const page of PAGES) {
    out[page.key] = { view: false, edit: false, features: {} };
    for (const f of page.features) out[page.key].features[f.key] = false;
  }
  return out;
}

// Reproduces today's viewer/editor/admin capability so existing members and
// the seeded system roles behave exactly as before the RBAC change.
export function defaultPermissionsForSystemRole(role) {
  if (role === 'admin') return { __full: true };

  const perms = emptyPermissions();
  const grant = (key, edit, features = {}) => {
    if (!perms[key]) return;
    perms[key].view = true;
    perms[key].edit = !!edit;
    for (const fk of Object.keys(features)) perms[key].features[fk] = !!features[fk];
  };

  if (role === 'editor') {
    // Editors: create/edit content, but not workspace/billing/team/redirects/
    // backups, and not the previously admin-only sub-features (collection CRUD,
    // social account management, campaign sending, template install).
    grant('pages', true, { publish: true, delete: true });
    grant('collections', true, { manage: false });
    grant('events', true);
    grant('media', true, { delete: true });
    grant('forms', true);
    grant('comments', true);
    grant('feedback', true);
    grant('templates', false, { install: false });
    grant('blocks', true);
    grant('library', true);
    grant('design', true);
    grant('email', true, { send: false });
    grant('social', true, { accounts: false });
    grant('connections', true);
    grant('audit', false);
    grant('redirects', false);
    grant('commerce', true);
    return perms;
  }

  // viewer — read-only across the surfaces a viewer could always see.
  for (const key of ['pages', 'collections', 'events', 'media', 'forms',
    'comments', 'feedback', 'templates', 'blocks', 'library', 'design',
    'redirects', 'audit']) {
    grant(key, false);
  }
  return perms;
}

// Coerce an untrusted permissions object (from a role-editor save) into a
// clean matrix: only known pages/features survive, and every value is a real
// boolean. Allowlist, not blocklist — anything not in the registry is dropped,
// and the __full sentinel can never be set from client input.
export function sanitizePermissions(input) {
  const out = emptyPermissions();
  if (!input || typeof input !== 'object') return out;
  for (const page of PAGES) {
    const src = input[page.key];
    if (!src || typeof src !== 'object') continue;
    out[page.key].view = !!src.view;
    out[page.key].edit = !!src.edit;
    const srcFeatures = (src.features && typeof src.features === 'object') ? src.features : {};
    for (const f of page.features) out[page.key].features[f.key] = !!srcFeatures[f.key];
  }
  return out;
}

// Resolve a role slug to its effective permissions. System roles are computed;
// custom roles come from storage (passed in, since this module has no I/O).
export function permissionsForRole(roleSlug, customRow) {
  if (isSystemRole(roleSlug)) return defaultPermissionsForSystemRole(roleSlug);
  return (customRow && customRow.permissions) || emptyPermissions();
}
