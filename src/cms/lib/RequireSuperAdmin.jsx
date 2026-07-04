import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useMe, useIsSuperAdmin } from './useMe.jsx';
import { GlassShell, GlassPanel } from './ui/Glass.jsx';

// Guard for every /super-admin/* route. Two stacked checks:
//   1. Signed-in via Clerk (SignedOut -> RedirectToSignIn).
//   2. The signed-in viewer's server-side isSuperAdmin flag (ADMIN_EMAILS).
//
// Deliberately independent of org membership — unlike RequireOrg, there's
// no :orgSlug param here. Server also enforces requireSuperAdmin on every
// underlying /api/orgs* and /api/nexus/* route; this is UX polish.

function SuperAdminGate({ children }) {
  const { loading } = useMe();
  const isSuperAdmin = useIsSuperAdmin();
  if (loading) return <LoadingShell />;
  if (!isSuperAdmin) return <NoAccess />;
  return children;
}

function LoadingShell() {
  return (
    <GlassShell>
      <div className="max-w-md mx-auto pt-24 px-6 text-center">
        <p className="text-sm text-zinc-400">Loading…</p>
      </div>
    </GlassShell>
  );
}

function NoAccess() {
  return (
    <GlassShell>
      <div className="max-w-md mx-auto pt-24 px-6">
        <GlassPanel className="p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">Super-admin only</h1>
          <p className="text-sm text-zinc-400">
            This area operates the Nexus platform itself and isn't part of
            any client workspace. Your account doesn't have super-admin
            access.
          </p>
        </GlassPanel>
      </div>
    </GlassShell>
  );
}

export default function RequireSuperAdmin({ children }) {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <SuperAdminGate>{children}</SuperAdminGate>
      </SignedIn>
    </>
  );
}
