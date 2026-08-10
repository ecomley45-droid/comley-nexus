import { Navigate, useParams } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useMe, useIsSuperAdmin } from './useMe.jsx';
import { GlassShell } from './ui/Glass.jsx';

// Guard for every /:orgSlug/* route. Two stacked checks:
//   1. Signed-in via Clerk (SignedOut -> RedirectToSignIn).
//   2. The signed-in viewer's server-side org slug matches the URL param.
//      Mismatch -> forward them to their own workspace; no org at all ->
//      "no access" panel.
//
// Server also enforces org membership on every write route (requireOrg
// in server.js + lib/ops/routes.js). This is UX polish, not security.

function OrgGate({ children }) {
  const { orgSlug } = useParams();
  const { me, loading } = useMe();
  const isSuperAdmin = useIsSuperAdmin();
  if (loading) return <LoadingShell />;
  const mySlug = me?.org?.slug || null;
  if (!mySlug) {
    // A platform super-admin legitimately has no client workspace -- send them
    // to the Super Admin portal, not the self-serve "create a workspace" flow.
    if (isSuperAdmin) return <Navigate to="/super-admin" replace />;
    // Otherwise: no workspace yet -> self-serve creation.
    return <Navigate to="/welcome" replace />;
  }
  if (mySlug !== orgSlug) return <Navigate to={`/${mySlug}`} replace />;
  return children;
}

function LoadingShell() {
  return (
    <GlassShell>
      <div className="max-w-md mx-auto pt-24 px-6 text-center">
        <p className="text-sm text-zinc-400">Loading workspace…</p>
      </div>
    </GlassShell>
  );
}

export default function RequireOrg({ children }) {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <OrgGate>{children}</OrgGate>
      </SignedIn>
    </>
  );
}
