import { Navigate, useParams } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn, useUser } from '@clerk/clerk-react';
import { orgSlugFromUser } from './orgSlug.js';
import { GlassShell, GlassPanel, GlassButton } from './ui/Glass.jsx';

// Guard for every /:orgSlug/* route. Two checks stacked:
//   1. Signed-in via Clerk (SignedOut branch redirects to hosted sign-in)
//   2. The signed-in user's org slug matches the URL param (otherwise
//      route them to their own workspace, or show a "no access" panel
//      if they have no org at all).
//
// The server also enforces org membership on every write route — this
// guard is UX polish, not security.

function OrgGate({ children }) {
  const { orgSlug } = useParams();
  const { user, isLoaded } = useUser();
  if (!isLoaded) return null;
  const mySlug = orgSlugFromUser(user);
  if (!mySlug) return <NoAccess />;
  if (mySlug !== orgSlug) return <Navigate to={`/${mySlug}`} replace />;
  return children;
}

function NoAccess() {
  return (
    <GlassShell>
      <div className="max-w-md mx-auto pt-24 px-6">
        <GlassPanel className="p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">No workspace on this account</h1>
          <p className="text-sm text-zinc-400 mb-6">
            Your Nexus account isn't linked to a workspace yet. Reach out and we'll
            get you set up.
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
