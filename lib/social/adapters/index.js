// Adapter registry + resolver. Every social operation goes through
// resolveAdapter(platform), which returns the live adapter when that
// platform's credentials are configured, and the runnable sandbox otherwise
// (or whenever SOCIAL_SANDBOX=1 forces it globally). That single swap point
// is what lets the whole feature run end-to-end today and flip to real APIs
// one platform at a time as each app-review clears — no call sites change.
//
// The adapter contract (all async except authUrl):
//   isConfigured() -> boolean
//   authUrl({ platform, redirectUri, state, codeChallenge }) -> string
//   exchangeCode({ platform, code, redirectUri, codeVerifier }) -> account fields
//   refresh({ account }) -> { accessToken, refreshToken, expiresAt }
//   publish({ account, text, media }) -> { externalId, externalUrl }
//   fetchMetrics({ account, day }) -> { followers, impressions, engagements, posts[] }

import { PLATFORM_IDS, isPlatform } from '../platforms.js';
import sandbox from './sandbox.js';
import meta from './meta.js';
import x from './x.js';
import linkedin from './linkedin.js';
import tiktok from './tiktok.js';

// platform id -> live adapter
const LIVE = {};
for (const a of [meta, x, linkedin, tiktok]) {
  for (const p of a.platforms) LIVE[p] = a;
}

export const sandboxForced = () => process.env.SOCIAL_SANDBOX === '1';

// Is this platform being served by the real API (vs the sandbox)?
export function isLive(platform) {
  if (sandboxForced()) return false;
  return !!LIVE[platform]?.isConfigured();
}

export function resolveAdapter(platform) {
  if (!isPlatform(platform)) throw new Error(`Unknown social platform "${platform}"`);
  return isLive(platform) ? LIVE[platform] : sandbox;
}

// For the UI/status route: which platforms are wired to real APIs vs running
// in sandbox on this deployment.
export function platformModes() {
  return PLATFORM_IDS.map((id) => ({ id, mode: isLive(id) ? 'live' : 'sandbox' }));
}
