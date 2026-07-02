import { useUser } from '@clerk/clerk-react';

const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

// Wraps Clerk's useUser so components don't need to know whether Clerk is
// configured. Local dev mode (no Clerk key) reads a role stashed in
// localStorage by the admin placeholder page, defaulting to "customer".
export function useCommerceUser() {
  if (clerkConfigured) {
    const { user, isLoaded } = useUser();
    const tier = user?.publicMetadata?.tier || 'customer';
    return { tier, email: user?.primaryEmailAddress?.emailAddress, isLoaded, clerkConfigured };
  }
  const tier = localStorage.getItem('dev_tier') || 'customer';
  return { tier, email: null, isLoaded: true, clerkConfigured: false };
}
