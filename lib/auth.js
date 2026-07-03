import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express';

// Real auth layer. Replaces the pre-launch X-User-Role trust model.
//
// Model:
//   - Every request goes through Clerk's clerkMiddleware() (attaches
//     req.auth() if a valid session cookie or Bearer token is present).
//   - resolveViewer() enriches req with { userId, email, name, image, role }
//     by asking Clerk for the user record and picking role out of
//     publicMetadata.role. First-run: emails in ADMIN_EMAILS env are
//     auto-treated as admin so the operator can bootstrap.
//   - requireRole(minRole) is the gate. Unauthenticated => 401.
//     Authenticated but under-privileged => 403.
//
// Dev escape hatch: when NODE_ENV !== 'production' AND CLERK_SECRET_KEY is
// unset, we allow requests through as a synthetic "dev-admin" so `npm run
// dev` still works before the operator sets up Clerk keys. Production
// startup crashes if the key is missing (see assertProductionAuth below).

export const ROLE_RANK = { viewer: 0, editor: 1, admin: 2 };

const isProd = () => process.env.NODE_ENV === 'production';
const clerkConfigured = () => !!process.env.CLERK_SECRET_KEY;

export function assertProductionAuth() {
  if (isProd() && !clerkConfigured()) {
    // Fail-safe: refuse to start in prod without real auth wired up.
    // Prevents accidental "we forgot to set the secret" deploys from
    // shipping an open backend.
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
    const bootstrappedAdmin = adminEmails().includes(email.toLowerCase());
    const role = bootstrappedAdmin ? 'admin' : (ROLE_RANK.hasOwnProperty(metadataRole) ? metadataRole : 'viewer');
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

// Attach req.viewer for every route. Downstream code reads req.viewer.role
// instead of the old header-driven req.userRole.
export function resolveViewer(req, _res, next) {
  // Dev bypass — only when Clerk isn't configured AND we're not in prod.
  if (!clerkConfigured() && !isProd()) {
    req.viewer = {
      userId: 'dev-admin',
      email: 'dev@localhost',
      name: 'Dev Admin',
      image: null,
      role: 'admin',
      _dev: true,
    };
    return next();
  }
  const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
  const userId = auth?.userId;
  if (!userId) {
    req.viewer = null;
    return next();
  }
  loadClerkUser(userId).then((viewer) => {
    req.viewer = viewer;
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
