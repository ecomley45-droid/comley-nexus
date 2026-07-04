// Cross-cuts React and non-React code. Clerk's useAuth() lives inside a
// component, but api.js is a plain module called from anywhere. This holds
// a getter function that AuthTokenBridge (mounted at the app root) sets
// from useAuth().getToken. Everyone else just calls getAuthToken().

let tokenGetter = null;

export function setAuthTokenGetter(fn) {
  tokenGetter = fn;
}

export async function getAuthToken() {
  if (!tokenGetter) return null;
  try {
    return await tokenGetter();
  } catch {
    return null;
  }
}
