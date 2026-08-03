import { useUser } from '@clerk/clerk-react';

const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

// main.jsx only mounts <ClerkProvider> when a publishable key exists, and
// Clerk's useUser() throws without a provider. Resolving the binding once at
// module load (rather than branching at the call site) keeps the hook call
// below unconditional while still working in a keyless local dev run.
const useClerkUser = clerkConfigured ? useUser : () => ({ user: null, isLoaded: true });

// Wraps Clerk's useUser so components don't need to know whether Clerk is
// configured. Local dev mode (no Clerk key) reads a role stashed in
// localStorage by the admin placeholder page, defaulting to "customer".
export function useCommerceUser() {
  const { user, isLoaded } = useClerkUser();
  if (!clerkConfigured) {
    const devTier = localStorage.getItem('dev_tier') || 'customer';
    return { tier: devTier, email: null, isLoaded: true, clerkConfigured: false };
  }
  const tier = user?.publicMetadata?.tier || 'customer';
  return { tier, email: user?.primaryEmailAddress?.emailAddress, isLoaded, clerkConfigured };
}
