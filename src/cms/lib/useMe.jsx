import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getMe } from './api.js';

// Server-derived identity: { viewer: { email, name, image, role },
// org: { id, slug, name, role, feature_flags } | null }.
//
// One shared context for the whole SPA so every component (nav, guards,
// pages) reads the SAME org from the server rather than re-deriving from
// Clerk metadata. The server is the source of truth — orgs live in
// Supabase's `org_members` table, not in the browser.

const MeContext = createContext({ me: null, loading: true, refresh: () => {} });

export function MeProvider({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSignedIn) { setMe(null); setLoading(false); return; }
    try {
      const data = await getMe();
      setMe(data);
    } catch {
      // 401 or 500 — treat as no session; children can still render.
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    refresh();
  }, [isLoaded, refresh]);

  return (
    <MeContext.Provider value={{ me, loading, refresh }}>
      {children}
    </MeContext.Provider>
  );
}

export function useMe() {
  return useContext(MeContext);
}

// Convenience: the current org's slug (e.g. "admin"). Returns null while
// loading or if the user has no org.
export function useOrgSlug() {
  const { me } = useMe();
  return me?.org?.slug || null;
}

// Convenience: the base path for all in-org routes ("/admin"). Same
// caveat as useOrgSlug — null while loading.
export function useOrgBase() {
  const slug = useOrgSlug();
  return slug ? `/${slug}` : null;
}

// True if the viewer's server-side role is >= admin. Used to hide/show
// admin-only nav items and settings pages.
export function useIsAdmin() {
  const { me } = useMe();
  return me?.org?.role === 'admin';
}

// True if the viewer's email is in ADMIN_EMAILS on the server -- lets us
// gate super-admin surfaces (org creation UI, /super-admin, Nexus's own
// site pages) that transcend, and are independent of, any single org.
// Server-derived (GET /api/me) rather than inferred from org membership,
// since super-admin status has nothing to do with which client workspace,
// if any, the viewer belongs to. Server enforces the real check via
// requireSuperAdmin on every underlying route.
export function useIsSuperAdmin() {
  const { me } = useMe();
  return !!me?.isSuperAdmin;
}
