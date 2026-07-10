// Orchestration layer between the HTTP routes and the repos/adapters. Keeps
// routes.js thin: OAuth connect/callback, token refresh, metrics polling, and
// the publish fan-out all live here.

import crypto from 'crypto';
import { encryptSecret, decryptSecret } from '../secretCrypto.js';
import { resolveAdapter, isLive } from './adapters/index.js';
import { validateForPlatform, isPlatform } from './platforms.js';
import * as accounts from './accounts.js';
import * as metricsRepo from './metrics.js';
import * as postsRepo from './posts.js';
import * as scheduler from './scheduler.js';

const STATE_TTL_MS = 15 * 60 * 1000;

// OAuth `state`: an encrypted, self-contained token (no server session store
// needed). Carries the org, platform, the PKCE verifier for X, and an
// issued-at we check for freshness on the way back.
function signState(payload) {
  return encodeURIComponent(encryptSecret(JSON.stringify({ ...payload, iat: Date.now() })));
}
function readState(raw) {
  const obj = JSON.parse(decryptSecret(decodeURIComponent(raw)));
  if (!obj?.iat || Date.now() - obj.iat > STATE_TTL_MS) throw new Error('This connection link expired — try connecting again.');
  return obj;
}

// PKCE helpers (X). base64url of a random verifier + its S256 challenge.
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ---- Connect (OAuth start) ----
export function buildConnectUrl({ orgId, platform, redirectUri }) {
  if (!isPlatform(platform)) throw new Error(`Unknown platform "${platform}"`);
  const adapter = resolveAdapter(platform);
  const { verifier, challenge } = pkce();
  const state = signState({ orgId, platform, verifier });
  return adapter.authUrl({ platform, redirectUri, state, codeChallenge: challenge });
}

// ---- Connect (OAuth callback) ----
export async function completeConnect({ query, redirectUri, connectedBy }) {
  if (query.error) throw new Error(`Authorization was declined (${query.error_description || query.error}).`);
  const { orgId, platform, verifier } = readState(query.state);
  const adapter = resolveAdapter(platform);
  const fields = await adapter.exchangeCode({ platform, code: query.code, redirectUri, codeVerifier: verifier });
  const saved = await accounts.connect(orgId, {
    platform, ...fields, sandbox: !isLive(platform), connectedBy,
  });
  return { orgId, account: saved };
}

// ---- Token refresh ----
export async function refreshAccount(account) {
  const adapter = resolveAdapter(account.platform);
  const next = await adapter.refresh({ account });
  await accounts.updateTokens(account.id, next);
  return next;
}

// Proactively refresh every soon-to-expire live account. Returns a summary.
export async function refreshDueTokens() {
  const due = await accounts.listExpiring();
  const results = { refreshed: 0, failed: 0 };
  for (const acc of due) {
    try { await refreshAccount(acc); results.refreshed++; }
    catch (e) { results.failed++; console.error(`[social/refresh] ${acc.platform} ${acc.id}:`, e.message); }
  }
  return results;
}

// ---- Metrics polling ----
export async function pollOrgMetrics(orgId, { day } = {}) {
  const accs = await accounts.listInternal(orgId);
  let ok = 0, failed = 0;
  for (const acc of accs) {
    try {
      const adapter = resolveAdapter(acc.platform);
      const m = await adapter.fetchMetrics({ account: acc, day });
      await metricsRepo.record(acc.id, { ...m, day });
      ok++;
    } catch (e) {
      failed++;
      console.error(`[social/metrics] ${acc.platform} ${acc.id}:`, e.message);
    }
  }
  return { accounts: accs.length, ok, failed };
}

// ---- Dashboard ----
// Rolls the daily metric snapshots into the shape the dashboard renders:
// headline KPIs, a per-day impressions/engagements series for the sparkline,
// and a per-account breakdown with each account's latest follower count.
export async function getDashboard(orgId, days = 30) {
  const accs = await accounts.listSafe(orgId);
  const rows = await metricsRepo.listForAccounts(accs.map((a) => a.id), days);

  const byDay = {};
  const byAccount = {};
  let impressions = 0, engagements = 0;
  for (const r of rows) {
    const d = (byDay[r.day] ||= { day: r.day, impressions: 0, engagements: 0 });
    d.impressions += r.impressions || 0;
    d.engagements += r.engagements || 0;
    impressions += r.impressions || 0;
    engagements += r.engagements || 0;
    // Latest row per account wins for followers (rows come back day-ascending).
    byAccount[r.account_id] = { followers: r.followers ?? byAccount[r.account_id]?.followers ?? 0 };
  }

  const series = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
  const followers = accs.reduce((sum, a) => sum + (byAccount[a.id]?.followers || 0), 0);
  const engagementRate = impressions ? engagements / impressions : 0;

  const perAccount = accs.map((a) => ({
    ...a,
    followers: byAccount[a.id]?.followers || 0,
  }));

  return {
    days,
    kpis: { followers, impressions, engagements, engagementRate },
    series,
    accounts: perAccount,
    connected: accs.length,
  };
}

// ---- Publish ----
// Publish one post to all its targets. Idempotent per target: an already
// 'sent' target is skipped, so a retried run (or a double QStash delivery)
// never double-posts.
export async function publishPost(orgId, postId) {
  const post = await postsRepo.get(orgId, postId);
  if (!post) throw new Error('Post not found');
  await postsRepo.setStatus(postId, 'publishing');

  let sent = 0, failed = 0;
  for (const target of post.targets) {
    if (target.status === 'sent') { sent++; continue; }
    const account = await accounts.getInternal(orgId, target.accountId);
    if (!account) {
      await postsRepo.setTargetResult(postId, target.accountId, { status: 'failed', error: 'Account no longer connected', incAttempt: true });
      failed++; continue;
    }
    const { text, media } = postsRepo.effectiveContent(post, target);
    // Guard against a constraint we can catch before hitting the API.
    const problems = validateForPlatform(account.platform, { text, media });
    if (problems.length) {
      await postsRepo.setTargetResult(postId, target.accountId, { status: 'failed', error: problems.join('; '), incAttempt: true });
      failed++; continue;
    }
    try {
      await postsRepo.setTargetResult(postId, target.accountId, { status: 'publishing' });
      const adapter = resolveAdapter(account.platform);
      const res = await adapter.publish({ account, text, media });
      await postsRepo.setTargetResult(postId, target.accountId, {
        status: 'sent', externalId: res.externalId, externalUrl: res.externalUrl, error: null, incAttempt: true,
      });
      sent++;
    } catch (e) {
      await postsRepo.setTargetResult(postId, target.accountId, { status: 'failed', error: e.message, incAttempt: true });
      failed++;
    }
  }
  const status = failed === 0 ? 'done' : (sent === 0 ? 'failed' : 'done');
  await postsRepo.setStatus(postId, status);
  return { sent, failed, status };
}

// Create a post and, if scheduled, arm the scheduler; if immediate, publish
// right away.
export async function createAndDispatch(orgId, input, { publishNow }) {
  const post = await postsRepo.create(orgId, input);
  if (publishNow) {
    const result = await publishPost(orgId, post.id);
    return { post: await postsRepo.get(orgId, post.id), result };
  }
  if (post.scheduledAt) {
    await scheduler.enqueue({
      postId: post.id, scheduledAt: post.scheduledAt,
      runNow: () => publishPost(orgId, post.id),
    });
  }
  return { post };
}

// Durable sweep: publish every scheduled post whose time has passed. Called
// by the Vercel-Cron endpoint and safe to call as often as you like.
export async function publishDueSweep() {
  const due = await postsRepo.listDue();
  let published = 0;
  for (const { id, org_id } of due) {
    try { await publishPost(org_id, id); published++; }
    catch (e) { console.error(`[social/sweep] ${id}:`, e.message); }
  }
  return { due: due.length, published };
}

// Publish a single post given only its id (the QStash per-post target, which
// carries no org context). Resolves the org, then delegates.
export async function publishById(postId) {
  const orgId = await postsRepo.findOrg(postId);
  if (!orgId) throw new Error(`Post ${postId} not found`);
  return publishPost(orgId, postId);
}

// Poll metrics for every org that has a connected account — the platform-wide
// metrics cron.
export async function pollAllOrgs({ day } = {}) {
  const orgIds = await accounts.listOrgIds();
  let ok = 0;
  for (const orgId of orgIds) {
    try { await pollOrgMetrics(orgId, { day }); ok++; }
    catch (e) { console.error(`[social/metrics] org ${orgId}:`, e.message); }
  }
  return { orgs: orgIds.length, ok };
}
