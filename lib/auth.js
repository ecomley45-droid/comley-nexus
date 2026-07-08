import { clerkMiddleware, clerkClient } from '@clerk/express';
import { orgForUser, orgs as orgsStorage } from './storage.js';

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

async function loadClerkUser(userId) {
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '';
    const metadataRole = user?.publicMetadata?.role;
    const bootstrapAdmin = adminEmails().includes(email.toLowerCase());
    const role = bootstrapAdmin ? 'admin' : (ROLE_RANK.hasOwnProperty(metadataRole) ? metadataRole : 'viewer');
    return {
      userId,
      email,
      name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || email,
      image: user?.imageUrl || null,
      role,
    };
  } catch {
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

// Attach req.viewer and req.org for every route.
export function resolveViewer(req, _res, next) {
  // Dev bypass — only when Clerk isn't configured AND we're not in prod.
  if (!clerkConfigured() && !isProd()) {
    req.viewer = {
      userId: 'dev-admin', email: 'dev@localhost', name: 'Dev Admin',
      image: null, role: 'admin', _dev: true,
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
  const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
  const userId = auth?.userId;
  if (!userId) {
    req.viewer = null;
    req.org = null;
    return next();
  }
  loadClerkUser(userId).then(async (viewer) => {
    req.viewer = viewer;
    req.org = await loadOrg(req, viewer);
    // A member's effective role is the role they were invited with in this
    // workspace (org_members.role -> req.org.role). loadClerkUser only knew
    // about Clerk publicMetadata.role, which invites never set, so invited
    // admins/editors were stuck at the default 'viewer' and every role-gated
    // action (incl. commerce admin) 403'd. Platform super-admins keep their
    // admin regardless of any single workspace membership.
    if (req.org?.role && !isSuperAdminViewer(viewer)) req.viewer.role = req.org.role;
    next();
  }).catch(() => {
    req.viewer = null;
    req.org = null;
    next();
  });
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
