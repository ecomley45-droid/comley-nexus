import { clerkMiddleware, clerkClient } from '@clerk/express';
import { orgForUser, orgMembers } from './storage.js';

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

// Look up the org the signed-in user belongs to. Falls back to bootstrapping
// them into 'admin' if their email is in ADMIN_EMAILS and they aren't a
// member of any org yet — that's how Ethan gets seeded on first sign-in.
async function loadOrg(viewer) {
  if (!viewer?.email) return null;
  let org = await orgForUser(viewer.email);
  if (org) return org;
  if (adminEmails().includes(viewer.email.toLowerCase())) {
    await orgMembers.add('admin', viewer.email, 'admin').catch(() => {});
    org = await orgForUser(viewer.email);
  }
  return org;
}

// Attach req.viewer and req.org for every route.
export function resolveViewer(req, _res, next) {
  // Dev bypass — only when Clerk isn't configured AND we're not in prod.
  if (!clerkConfigured() && !isProd()) {
    req.viewer = {
      userId: 'dev-admin', email: 'dev@localhost', name: 'Dev Admin',
      image: null, role: 'admin', _dev: true,
    };
    req.org = { id: 'admin', slug: 'admin', name: 'Dev Org', role: 'admin', feature_flags: {} };
    return next();
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
    req.org = await loadOrg(viewer);
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
// orgs) where the operator is acting outside any single org.
export const requireSuperAdmin = (req, res, next) => {
  const emails = adminEmails();
  if (!req.viewer?.email) return res.status(401).json({ error: 'Authentication required' });
  if (!emails.includes(req.viewer.email.toLowerCase())) {
    return res.status(403).json({ error: 'Super-admin required' });
  }
  next();
};
