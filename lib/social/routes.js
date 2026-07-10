// Social API surface. Mounted by server.js via mountSocialApi(app).
//
// Gating:
//   • requireOrg      — signed in + a workspace + not paused (mirrors
//                        server.js's own requireOrg).
//   • requireSocial   — the paid-tier gate: org.feature_flags.social, OR
//                        SOCIAL_SANDBOX=1 so local/dev can exercise it.
//   • requireRole     — writes need 'editor'; disconnect needs 'admin'.
//   • cron endpoints  — no session; guarded by SOCIAL_CRON_SECRET instead,
//                        so QStash / Vercel Cron can call them.

import { requireRole } from '../auth.js';
import { PLATFORMS, isPlatform } from './platforms.js';
import { platformModes } from './adapters/index.js';
import * as accounts from './accounts.js';
import * as postsRepo from './posts.js';
import * as scheduler from './scheduler.js';
import * as social from './service.js';

const sandboxForced = () => process.env.SOCIAL_SANDBOX === '1';

const requireOrg = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!req.org) return res.status(403).json({ error: 'No workspace on this account' });
  if (req.org.paused) return res.status(423).json({ error: 'Something went wrong. Please contact support.' });
  next();
};

// The billing gate. Off unless the workspace has the feature flag — except in
// sandbox, where the whole point is to try it without provisioning.
const requireSocial = (req, res, next) => {
  const enabled = !!req.org?.feature_flags?.social || sandboxForced();
  if (!enabled) return res.status(403).json({ error: 'Social isn’t enabled for this workspace.' });
  next();
};

// Absolute base for OAuth redirect URIs. Must be byte-identical between the
// authorize step and the callback, so both derive it from here.
const baseUrl = (req) =>
  (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const callbackUri = (req) => `${baseUrl(req)}/api/social/oauth/callback`;

function cronAuthorized(req) {
  const secret = process.env.SOCIAL_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production'; // dev convenience only
  const provided = req.get('x-social-cron-secret') || req.body?.secret || req.query?.secret;
  return provided === secret;
}

export function mountSocialApi(app) {
  // ---- Status + platform metadata ----
  app.get('/api/social/status', requireOrg, (req, res) => {
    res.json({
      enabled: !!req.org?.feature_flags?.social || sandboxForced(),
      sandbox: sandboxForced(),
      platforms: platformModes(),
    });
  });

  app.get('/api/social/platforms', requireOrg, requireSocial, (req, res) => {
    res.json({ platforms: PLATFORMS });
  });

  // ---- Accounts ----
  app.get('/api/social/accounts', requireOrg, requireSocial, async (req, res, next) => {
    try { res.json({ accounts: await accounts.listSafe(req.org.id) }); }
    catch (e) { next(e); }
  });

  // OAuth start: returns the URL the browser should navigate to. In sandbox
  // that URL loops straight back to our callback so the round trip completes
  // on localhost.
  app.get('/api/social/oauth/start', requireOrg, requireSocial, requireRole('editor'), (req, res, next) => {
    try {
      const platform = String(req.query.platform || '');
      if (!isPlatform(platform)) return res.status(400).json({ error: 'Unknown platform' });
      const url = social.buildConnectUrl({ orgId: req.org.id, platform, redirectUri: callbackUri(req) });
      res.json({ url });
    } catch (e) { next(e); }
  });

  // OAuth callback: the platform (or the sandbox loop) redirects the browser
  // here. The signed-in viewer must belong to the org named in the (signed,
  // TTL-bound) state, then we redirect back into the SPA.
  app.get('/api/social/oauth/callback', requireOrg, async (req, res) => {
    const backTo = (params) => `/${req.org.slug}/social/accounts?${new URLSearchParams(params)}`;
    try {
      const { orgId, account } = await social.completeConnect({
        query: req.query, redirectUri: callbackUri(req), connectedBy: req.viewer.email,
      });
      if (orgId !== req.org.id) return res.redirect(backTo({ error: 'Workspace mismatch — reconnect from your own workspace.' }));
      res.redirect(backTo({ connected: '1', platform: account.platform }));
    } catch (e) {
      res.redirect(backTo({ error: e.message }));
    }
  });

  app.delete('/api/social/accounts/:id', requireOrg, requireSocial, requireRole('admin'), async (req, res, next) => {
    try { await accounts.disconnect(req.org.id, req.params.id); res.json({ success: true }); }
    catch (e) { next(e); }
  });

  app.post('/api/social/accounts/:id/refresh', requireOrg, requireSocial, requireRole('admin'), async (req, res, next) => {
    try {
      const acc = await accounts.getInternal(req.org.id, req.params.id);
      if (!acc) return res.status(404).json({ error: 'Account not found' });
      await social.refreshAccount(acc);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // ---- Dashboard ----
  app.get('/api/social/dashboard', requireOrg, requireSocial, async (req, res, next) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
      res.json(await social.getDashboard(req.org.id, days));
    } catch (e) { next(e); }
  });

  // Pull fresh metrics on demand (the dashboard's "Refresh" button). Also a
  // convenient way to seed the sandbox with today's numbers.
  app.post('/api/social/poll', requireOrg, requireSocial, requireRole('editor'), async (req, res, next) => {
    try { res.json(await social.pollOrgMetrics(req.org.id)); }
    catch (e) { next(e); }
  });

  // ---- Posts (compose / publish / schedule) ----
  app.get('/api/social/posts', requireOrg, requireSocial, async (req, res, next) => {
    try { res.json({ posts: await postsRepo.list(req.org.id, { status: req.query.status }) }); }
    catch (e) { next(e); }
  });

  app.get('/api/social/posts/:id', requireOrg, requireSocial, async (req, res, next) => {
    try {
      const post = await postsRepo.get(req.org.id, req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json(post);
    } catch (e) { next(e); }
  });

  app.post('/api/social/posts', requireOrg, requireSocial, requireRole('editor'), async (req, res, next) => {
    try {
      const { body = '', media = [], targets = [], scheduledAt = null, publishNow = false } = req.body || {};
      if (!Array.isArray(targets) || targets.length === 0) return res.status(400).json({ error: 'Pick at least one account to post to.' });
      if (!body.trim() && media.length === 0) return res.status(400).json({ error: 'Write something or add media first.' });
      // A scheduled post in the past is almost certainly a mistake.
      if (scheduledAt && !publishNow && new Date(scheduledAt).getTime() < Date.now() - 60_000) {
        return res.status(400).json({ error: 'That schedule time is in the past.' });
      }
      const input = {
        body, media, targets,
        scheduledAt: publishNow ? null : scheduledAt,
        status: publishNow ? 'publishing' : (scheduledAt ? 'scheduled' : 'draft'),
        createdBy: req.viewer.email,
      };
      const out = await social.createAndDispatch(req.org.id, input, { publishNow });
      res.json(out);
    } catch (e) { next(e); }
  });

  // Publish now / retry a failed post.
  app.post('/api/social/posts/:id/publish', requireOrg, requireSocial, requireRole('editor'), async (req, res, next) => {
    try {
      scheduler.cancel(req.params.id); // if it was scheduled, don't double-fire
      const result = await social.publishPost(req.org.id, req.params.id);
      res.json({ result, post: await postsRepo.get(req.org.id, req.params.id) });
    } catch (e) { next(e); }
  });

  app.delete('/api/social/posts/:id', requireOrg, requireSocial, requireRole('editor'), async (req, res, next) => {
    try { scheduler.cancel(req.params.id); await postsRepo.remove(req.org.id, req.params.id); res.json({ success: true }); }
    catch (e) { next(e); }
  });

  // ---- Cron (secret-guarded, no session) ----
  // QStash per-post target: fire one scheduled post at its time.
  app.post('/api/social/cron/publish', async (req, res) => {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await social.publishById(req.body?.postId)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Durable sweep of everything due (Vercel Cron backstop).
  app.all('/api/social/cron/publish-due', async (req, res) => {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await social.publishDueSweep()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.all('/api/social/cron/refresh-tokens', async (req, res) => {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await social.refreshDueTokens()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.all('/api/social/cron/poll-metrics', async (req, res) => {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await social.pollAllOrgs()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
}
