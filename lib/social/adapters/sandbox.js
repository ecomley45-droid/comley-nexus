// The runnable fake. When SOCIAL_SANDBOX=1 (or a platform has no real
// credentials configured), every adapter call routes here instead of the
// live API, so the entire flow -- connect an account, see metrics, compose,
// publish, watch a scheduled post fire -- works end to end on a laptop with
// nothing but Supabase.
//
// It fabricates data that is deterministic per account (so a dashboard is
// stable across reloads) yet varies by day (so sparklines actually move).
// Nothing here ever touches a network.

import crypto from 'crypto';
import { platformLabel } from '../platforms.js';

// Stable 0..1 pseudo-random from a string -- same seed always same value,
// so a given account+day always yields the same fabricated numbers.
function seeded(...parts) {
  const h = crypto.createHash('sha256').update(parts.join('|')).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

const SANDBOX_HANDLES = {
  ig: '@studio.sandbox', fb: 'Sandbox Studio', x: '@sandbox_studio',
  li: 'Sandbox Studio', tt: '@sandbox.studio',
};

export function isConfigured() {
  return true; // always available -- that's the point
}

// "OAuth" with no redirect: we hand back a URL that points straight at our
// own callback with a fabricated code, so the connect button completes the
// round trip without leaving localhost.
export function authUrl({ platform, redirectUri, state }) {
  const code = `sandbox_${platform}_${crypto.randomBytes(4).toString('hex')}`;
  const u = new URL(redirectUri);
  u.searchParams.set('code', code);
  u.searchParams.set('state', state);
  u.searchParams.set('sandbox', '1');
  return u.toString();
}

export async function exchangeCode({ platform }) {
  return {
    externalId: `sbx_${platform}_${crypto.randomBytes(4).toString('hex')}`,
    handle: SANDBOX_HANDLES[platform] || `@sandbox_${platform}`,
    accessToken: `sandbox-access-${crypto.randomBytes(8).toString('hex')}`,
    refreshToken: `sandbox-refresh-${crypto.randomBytes(8).toString('hex')}`,
    // Far-future so the refresh worker never bothers a fake account.
    expiresAt: new Date(Date.now() + 3650 * 86400000).toISOString(),
    scopes: 'sandbox',
  };
}

export async function refresh({ account }) {
  return {
    accessToken: `sandbox-access-${crypto.randomBytes(8).toString('hex')}`,
    refreshToken: account?.refreshToken || `sandbox-refresh-${crypto.randomBytes(8).toString('hex')}`,
    expiresAt: new Date(Date.now() + 3650 * 86400000).toISOString(),
  };
}

export async function publish({ account, text }) {
  const id = `sbx_post_${crypto.randomBytes(6).toString('hex')}`;
  // Visible proof in the server log that a (scheduled or immediate) publish
  // fired -- handy when watching a QStash-fired post land.
  console.log(`[social/sandbox] "published" to ${platformLabel(account.platform)} (${account.handle}): ${JSON.stringify(text).slice(0, 80)}`);
  return { externalId: id, externalUrl: `https://sandbox.local/${account.platform}/${id}` };
}

// Account-level followers/impressions/engagements for the given day, plus a
// few per-post rows. Seeded so the dashboard is stable; day-varied so charts
// breathe.
export async function fetchMetrics({ account, day = new Date().toISOString().slice(0, 10) }) {
  const base = 800 + Math.floor(seeded(account.id, 'followers') * 12000);
  // Followers drift slowly upward day to day.
  const dayIndex = Math.floor(new Date(day).getTime() / 86400000);
  const followers = base + Math.floor(seeded(account.id, 'growth') * 40) * (dayIndex % 30);
  const impressions = 200 + Math.floor(seeded(account.id, day, 'imp') * 5000);
  const engagements = Math.floor(impressions * (0.02 + seeded(account.id, day, 'eng') * 0.08));
  return {
    followers,
    impressions,
    engagements,
    posts: [],
  };
}

// Recent posts for the Feed block. Fabricated but stable per account, with
// placeholder images so the block renders something real-looking on a page.
export async function fetchFeed({ account, limit = 6 }) {
  const n = Math.min(12, Math.max(1, limit));
  const label = platformLabel(account.platform);
  return Array.from({ length: n }, (_, i) => {
    const r = seeded(account.id, 'feed', String(i));
    const day = new Date(Date.now() - i * 86400000);
    return {
      externalId: `sbx_feed_${i}`,
      text: `${label} post ${i + 1} from ${account.handle} — sample caption ${Math.floor(r * 1000)}.`,
      image: `https://placehold.co/600x600?text=${encodeURIComponent(label + ' ' + (i + 1))}`,
      url: `https://sandbox.local/${account.platform}/feed/${i}`,
      postedAt: day.toISOString(),
    };
  });
}

export default { platforms: ['ig', 'fb', 'x', 'li', 'tt'], isConfigured, authUrl, exchangeCode, refresh, publish, fetchMetrics, fetchFeed };
