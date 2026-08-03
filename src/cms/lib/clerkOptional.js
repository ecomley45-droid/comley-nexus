// Clerk hooks that are safe to call unconditionally.
//
// main.jsx only mounts <ClerkProvider> when VITE_CLERK_PUBLISHABLE_KEY is
// set, because Clerk throws without a key — so a local dev run with no keys
// has no provider, and calling useUser() there throws. Components handled
// that by calling the hook conditionally (`clerkConfigured ? useUser() : …`),
// which works (the flag is a build-time constant, so hook order never
// actually changes between renders) but trips rules-of-hooks on every call
// site and reads as a bug to anyone new.
//
// Resolving the binding ONCE here, at module load, gets both: every call
// site is an unconditional hook call, and a keyless run gets inert stand-ins
// with the same shapes.

import { useUser, useClerk, useReverification } from '@clerk/clerk-react';

export const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const notConfigured = async () => { throw new Error('Clerk is not configured.'); };

/** `{ user, isLoaded }` — user is null when Clerk isn't configured. */
export const useOptionalUser = clerkConfigured ? useUser : () => ({ user: null, isLoaded: true });

/** The Clerk client, or null when Clerk isn't configured. */
export const useOptionalClerk = clerkConfigured ? useClerk : () => null;

/**
 * Wraps a sensitive mutation so Clerk can prompt for step-up auth and retry.
 * Without Clerk, returns a function that rejects rather than silently
 * appearing to succeed.
 */
export const useOptionalReverification = clerkConfigured ? useReverification : () => notConfigured;
