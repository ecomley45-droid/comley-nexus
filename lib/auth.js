import { clerkMiddleware, clerkClient } from '@clerk/express';
import { loadSharedViewer } from './dualAuth.js';
import { orgForUser, orgs as orgsStorage, roles as rolesStorage } from './storage.js';
import {
  can, isSystemRole, defaultPermissionsForSystemRole, emptyPermissions, permissionsForRole,
} from '../src/shared/permissions.js';

// Cookie a super-admin's browser carries while "viewing as" a client
// workspace they aren't necessarily a real org_members row for. Deliberately
// NOT a new org_members row -- see loadOrg()'s comment on why that would be
// a landmine (orgForUser's single-row-per-email assumption).
export const VIEW_AS_COOKIE = 'super_admin_view_as';

// Real auth layer. Two pieces:
//
//   1. resolveViewer(): looks up the signed-in Clerk user, enriches req
//      with { userId, email, name, image, role }.
//   2. resolveOrg(): looks up which org that email belongs to via the
//      `org_members` table and attaches req.org = { id, slug, role,
//      feature_flags }. First-run: emails in ADMIN_EMAILS auto-join the
//      'admin' org as admin so the operator can bootstrap.
//
// requireRole(role) gates writes; requireOrgMatch() gates /:orgSlug/*
// so a viewer can't peek at another org by manipulating the URL.
//
// Dev escape hatch: when NODE_ENV !== 'production' AND CLERK_SECRET_KEY
// is unset, req.viewer is a synthetic dev-admin belonging to org 'admin'.
// Production crashes on start without CLERK_SECRET_KEY.

export const ROLE_RANK = { viewer: 0, editor: 1, admin: 2 };

const isProd = () => process.env.NODE_ENV === 'production';
const clerkConfigured = () => !!process.env.CLERK_SECRET_KEY;

export function assertProductionAuth() {
  if (isProd() && !clerkConfigured()) {
    throw new Error('CLERK_SECRET_KEY is required in production. Refusing to start.');
  }
}

export function attachClerk(app) {
  if (clerkConfigured()) {
    app.use(clerkMiddleware());
  }
}

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// Bounded, short-TTL cache of the Clerk user record. resolveViewer runs on
// EVERY authenticated request (app.use), and each call used to hit Clerk's
// Backend API (clerkClient.users.getUser), which is rate-limited. A busy
// dashboard fires several /api calls per screen; after enough of them Clerk
// starts returning 429, this function fell to its catch and returned null, and
// the viewer momentarily looked signed-out -- booted from /super-admin, or
// bounced to /welcome as if they had no workspace (RequireOrg). Caching
// collapses the lookups to at most one per user per TTL, and a transient
// failure now falls back to the last known-good record instead of logging the
// user out. The effective role still comes from org_members via loadOrg on
// every request (see resolveViewer), so a role change is never masked by this
// cache -- only email/name/image/bootstrap-admin are cached, and those are
// stable.
const CLERK_USER_TTL_MS = 60_000;
const CLERK_USER_CACHE_MAX = 5000;
const clerkUserCache = new Map(); // userId -> { fields, exp }

function cacheClerkUser(userId, fields) {
  // Bounded eviction: Map preserves insertion order, so the first key is the
  // oldest. Drop it when full rather than letting the cache grow unbounded.
  if (clerkUserCache.size >= CLERK_USER_CACHE_MAX) {
    const oldest = clerkUserCache.keys().next().value;
    if (oldest !== undefined) clerkUserCache.delete(oldest);
  }
  clerkUserCache.set(userId, { fields, exp: Date.now() + CLERK_USER_TTL_MS });
}

async function loadClerkUser(userId) {
  const cached = clerkUserCache.get(userId);
  if (cached && cached.exp > Date.now()) return { ...cached.fields };
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '';
    const metadataRole = user?.publicMetadata?.role;
    const bootstrapAdmin = adminEmails().includes(email.toLowerCase());
    const role = bootstrapAdmin ? 'admin' : (ROLE_RANK.hasOwnProperty(metadataRole) ? metadataRole : 'viewer');
    const fields = {
      userId,
      email,
      name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || email,
      image: user?.imageUrl || null,
      role,
    };
    cacheClerkUser(userId, fields);
    // Return a fresh copy each call: resolveViewer mutates role/permissions on
    // the returned object, which must never leak back into the cached record.
    return { ...fields };
  } catch {
    // Transient Clerk Backend API failure (most often a 429 rate limit). Prefer
    // the last known-good record -- even if just expired -- over returning null
    // and bouncing the user to sign-in / workspace setup.
    if (cached) return { ...cached.fields };
    return null;
  }
}

// Whether an email is a platform super-admin (ADMIN_EMAILS), independent of
// any org membership. This is the single source of truth for "operates
// Nexus" — it does NOT imply membership in, or ownership of, any client org.
export const isSuperAdminEmail = (email) =>
  !!email && adminEmails().includes(email.toLowerCase());

// Same check, but also honors the dev bypass viewer (no Clerk configured,
// not prod) so /super-admin is testable locally without ADMIN_EMAILS set.
export const isSuperAdminViewer = (viewer) => !!viewer?._dev || isSuperAdminEmail(viewer?.email);

// Look up the org the signed-in user belongs to, if any. Being a
// super-admin (ADMIN_EMAILS) no longer implies membership in any client
// org — that would re-couple "operates Nexus" with "owns a workspace",
// which is exactly what this split removes. Super-admins with no org
// membership can still reach /super-admin; they just have no client
// workspace until someone adds them to one via org_members.
//
// Exception: a super-admin carrying the VIEW_AS_COOKIE "opens" a workspace
// without ever gaining a real org_members row there -- see the cookie's
// own comment for why that matters. This is checked first so it can
// override even a super-admin's own real org membership (e.g. Ethan
// viewing a different client while still "at home" in comley-creative).
async function loadOrg(req, viewer) {
  if (!viewer?.email) return null;
  const viewAsOrgId = req.cookies?.[VIEW_AS_COOKIE];
  if (viewAsOrgId && isSuperAdminViewer(viewer)) {
    const org = await orgsStorage.get(viewAsOrgId);
    if (org) {
      return { id: org.id, slug: org.id, name: org.name, role: 'admin', feature_flags: org.feature_flags || {}, domain: org.domain || null, paused: !!org.paused, viewingAs: true };
    }
  }
  return orgForUser(viewer.email);
}

// Resolve a viewer's effective permission matrix for their current org.
// Super-admins and the immutable `admin` system role get full access; other
// system roles are computed; custom role slugs are loaded from storage. Falls
// back to an empty (deny-all) matrix on any lookup failure so a storage blip
// can never accidentally grant access.
export async function resolvePermissions(viewer, org) {
  if (!viewer) return null;
  if (isSuperAdminViewer(viewer)) return { __full: true };
  const roleSlug = viewer.role || 'viewer';
  if (isSystemRole(roleSlug)) return defaultPermissionsForSystemRole(roleSlug);
  if (!org?.id) return emptyPermissions();
  try {
    const row = await rolesStorage.get(org.id, roleSlug);
    return permissionsForRole(roleSlug, row);
  } catch {
    // Deploy-ahead-of-migration: no roles table yet -> deny custom roles
    // rather than 500. System roles (the norm) never reach this branch.
    return emptyPermissions();
  }
}

// Attach req.viewer and req.org for every route.
export function resolveViewer(req, _res, next) {
  // Dev bypass — only when Clerk isn't configured AND we're not in prod.
  if (!clerkConfigured() && !isProd()) {
    req.viewer = {
      userId: 'dev-admin', email: 'dev@localhost', name: 'Dev Admin',
      image: null, role: 'admin', _dev: true, permissions: { __full: true },
    };
    loadOrg(req, req.viewer)
      .then((org) => {
        req.org = org || { id: 'comley-creative', slug: 'comley-creative', name: 'Dev Org', role: 'admin', feature_flags: {} };
      })
      .catch(() => {
        // No Supabase configured locally, or the view-as org lookup failed --
        // fall back to the hardcoded dev org rather than hanging the request.
        req.org = { id: 'comley-creative', slug: 'comley-creative', name: 'Dev Org', role: 'admin', feature_flags: {} };
      })
      .then(next);
    return;
  }
  const finishResolve = async (viewer) => {
    req.viewer = viewer;
    req.org = await loadOrg(req, viewer);
    // A member's effective role is the role they were invited with in this
    // workspace (org_members.role -> req.org.role). loadClerkUser only knew
    // about Clerk publicMetadata.role, which invites never set, so invited
    // admins/editors were stuck at the default 'viewer' and every role-gated
    // action (incl. commerce admin) 403'd. Platform super-admins keep their
    // admin regardless of any single workspace membership.
    if (req.org?.role && !isSuperAdminViewer(viewer)) req.viewer.role = req.org.role;
    if (req.viewer) req.viewer.permissions = await resolvePermissions(req.viewer, req.org);
    next();
  };
  const denyAuth = () => {
    req.viewer = null;
    req.org = null;
    next();
  };

  const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
  const userId = auth?.userId;
  if (userId) {
    loadClerkUser(userId).then(finishResolve).catch(denyAuth);
    return;
  }
  // No session from this app's own Clerk instance. Fall back to the shared
  // ecosystem instance (Phase C pilot, lib/dualAuth.js) — never the reverse,
  // an own-instance session above always wins when present.
  loadSharedViewer(req).then((shared) => {
    if (!shared) return denyAuth();
    const bootstrapAdmin = adminEmails().includes(shared.email.toLowerCase());
    finishResolve({ ...shared, role: bootstrapAdmin ? 'admin' : 'viewer' });
  }).catch(denyAuth);
}

export const requireAuth = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  next();
};

export const requireRole = (minRole) => (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  const rank = ROLE_RANK[req.viewer.role] ?? 0;
  if (rank < ROLE_RANK[minRole]) {
    return res.status(403).json({ error: `Requires "${minRole}" role (you are "${req.viewer.role}")` });
  }
  next();
};

// Fine-grained gate for a workspace page / sub-feature, checked against the
// viewer's resolved permission matrix (src/shared/permissions.js). This is the
// RBAC replacement for requireRole on write routes:
//   requirePermission('pages')                 -> may edit pages
//   requirePermission('social', 'edit', 'accounts') -> edit + accounts feature
// Defaults to the 'edit' action since every gated route is a write.
export const requirePermission = (pageKey, action = 'edit', featureKey = null) => (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!can(req.viewer.permissions, pageKey, action, featureKey)) {
    const what = featureKey ? `${featureKey} on ${pageKey}` : `${action} ${pageKey}`;
    return res.status(403).json({ error: `Your role isn't allowed to ${what}` });
  }
  next();
};

// Gates /:orgSlug/* routes: the URL param must match the viewer's org.
// Applied AFTER resolveViewer, so req.org is set. Unauth'd requests
// pass through here (no org to compare) and get caught by requireRole
// downstream.
export const requireOrgMatch = (req, res, next) => {
  const urlSlug = req.params?.orgSlug || req.query?.orgSlug;
  if (!urlSlug) return next();
  if (!req.org) return res.status(403).json({ error: 'No org membership' });
  if (req.org.slug !== urlSlug) return res.status(403).json({ error: 'Org mismatch' });
  next();
};

// Cross-org escape hatch: for super-admin routes (create org, list all
// orgs, edit Nexus's own site) where the operator is acting outside any
// single org.
export const requireSuperAdmin = (req, res, next) => {
  if (!req.viewer?.email) return res.status(401).json({ error: 'Authentication required' });
  if (!isSuperAdminViewer(req.viewer)) {
    return res.status(403).json({ error: 'Super-admin required' });
  }
  next();
};
