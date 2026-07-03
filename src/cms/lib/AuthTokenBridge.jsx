import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setAuthTokenGetter } from './authToken.js';

// Bridge between Clerk's React hooks and the plain api.js module. Mount
// this once inside <ClerkProvider>. It registers a getter that api.js
// calls at request time so every fetch carries a fresh Clerk JWT in
// Authorization: Bearer <token>.
export default function AuthTokenBridge() {
  const { getToken, isLoaded } = useAuth();
  useEffect(() => {
    if (isLoaded) setAuthTokenGetter(() => getToken());
  }, [isLoaded, getToken]);
  return null;
}
