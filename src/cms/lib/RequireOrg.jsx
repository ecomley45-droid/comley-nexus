import { Navigate, useParams } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useMe } from './useMe.jsx';
import { GlassShell, GlassPanel, GlassButton } from './ui/Glass.jsx';

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
  if (loading) return <LoadingShell />;
  const mySlug = me?.org?.slug || null;
  if (!mySlug) return <NoAccess />;
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

function NoAccess() {
  return (
    <GlassShell>
      <div className="max-w-md mx-auto pt-24 px-6">
        <GlassPanel className="p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">No workspace on this account</h1>
          <p className="text-sm text-zinc-400 mb-6">
            Your Nexus account isn't linked to a workspace yet. Reach out and we'll get you set up.
          </p>
          <a href="mailto:hello@comleycreative.com?subject=Nexus%20workspace%20access">
            <GlassButton className="text-sm">Request access</GlassButton>
          </a>
        </GlassPanel>
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
