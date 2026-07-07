// Sentry is initialized via `node --import ./instrument.mjs server.js`
// locally, and via api/index.js's `import '../instrument.mjs'` on Vercel.
// Do NOT `import ./instrument.mjs` here — ESM hoisting would defeat the
// ordering that Sentry's auto-instrumentation depends on.
import * as Sentry from '@sentry/node';

import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { compilePageHtml, getFullPath, pickWeightedVariant } from './src/shared/compilePage.js';
import { mountCommerceWebhooks, mountCommerceApi } from './lib/commerce/routes.js';
import { mountOpsApi } from './lib/ops/routes.js';
import { mountNexusApi } from './lib/nexusRoutes.js';
import { mountSuperAdminApi } from './lib/superAdminRoutes.js';
import { mountBlockCatalogApi } from './lib/blockCatalogRoutes.js';
import {
  attachClerk, resolveViewer, requireRole, requireOrgMatch, requireSuperAdmin,
  isSuperAdminViewer, assertProductionAuth, requireAuth,
} from './lib/auth.js';
import { sanitizePage, sanitizeGlobalSettings, sanitizeContentHtml, pagesContainScriptBlock, pagesContainFullHtmlMode } from './lib/sanitize.js';
import * as storage from './lib/storage.js';
import * as nexus from './lib/nexus.js';
import { classifyBlock, hasAnthropicKey } from './lib/ai.js';
import { clerkClient } from '@clerk/express';
import { sendFormNotification } from './lib/email.js';
import { SITE_TEMPLATES, buildTemplateSite } from './src/shared/siteTemplates.js';
import { PLANS, createCheckoutSession, createPortalSession } from './lib/billing.js';
import { db } from './lib/db.js';
import crypto from 'crypto';

assertProductionAuth();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

mountCommerceWebhooks(app);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && CORS_ORIGINS.includes(origin) ? 200 : 403);
  next();
});

app.use('/api', rateLimit({
  windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false,
}));

attachClerk(app);
app.use(resolveViewer);

const feedbackJson = express.json({ limit: '4mb' });
const feedbackLimit = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
const abTrackLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
// Real per-call cost (Anthropic API), so this is capped tighter than most
// content-writing routes -- one paste-in import can trigger several calls
// (one per low-confidence block), but not unbounded ones.
const aiClassifyLimit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

// ================= HELPERS =================

// Guard used on every route that reads/writes tenant-scoped data. Ensures
// req.org is populated before we hit the storage layer. Unauthenticated
// requests get 401; authenticated but org-less users get 403 with an
// actionable message. A paused workspace (Super Admin lifecycle control,
// see OrgsPage.jsx) gets a deliberately generic 423 -- no forced sign-out,
// but every further org-scoped call fails from here on until resumed. The
// client's api.js request() wrapper turns this into a full-page "something
// went wrong" takeover rather than a normal error, and never reveals that
// the workspace was paused.
const requireOrg = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!req.org) return res.status(403).json({ error: 'No workspace on this account' });
  if (req.org.paused) return res.status(423).json({ error: 'Something went wrong. Please contact support.' });
  next();
};

const auditFor = (orgId, viewer) => (action, details) =>
  storage.audit.append(orgId, action, details, viewer?.email || null)
    .catch((e) => console.error('[audit]', e.message));

const applyDueSchedules = async (orgId) => {
  try {
    const flipped = await storage.pages.applyScheduledPublishes(orgId);
    if (flipped > 0) await storage.audit.append(orgId, 'Scheduled publish', `${flipped} page(s) auto-published on schedule`);
  } catch (e) {
    console.error('[schedule]', e.message);
  }
};

// ================= HEALTH + IDENTITY =================

app.get('/api/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// Returns the current viewer's identity + org. The client uses this to
// figure out which /:orgSlug to route to after sign-in without duplicating
// the ADMIN_EMAILS bootstrap logic in the browser bundle.
app.get('/api/me', (req, res) => {
  if (!req.viewer) return res.status(401).json({ error: 'Not signed in' });
  res.json({
    viewer: {
      email: req.viewer.email,
      name: req.viewer.name,
      image: req.viewer.image,
      role: req.viewer.role,
    },
    isSuperAdmin: isSuperAdminViewer(req.viewer),
    org: req.org ? {
      id: req.org.id,
      slug: req.org.slug,
      name: req.org.name,
      role: req.org.role,
      feature_flags: req.org.feature_flags || {},
      domain: req.org.domain || null,
      viewingAs: !!req.org.viewingAs,
    } : null,
  });
});

// ================= CUSTOM DOMAIN (client-submitted request) =================

// Clients can't wire a domain up themselves -- the Vercel project is shared
// across every org, so going live still takes a super-admin adding it there
// and setting orgs.domain (Super Admin > Client workspaces > Domain). This
// just records what the client is asking for, so that step has a target.
// A live domain (orgs.domain, used by resolvePublicSite below) is separate
// from this request and is never written by this route.
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

app.patch('/api/org/custom-domain', requireOrg, requireRole('admin'), async (req, res, next) => {
  try {
    const raw = String(req.body?.domain || '').trim().toLowerCase();
    if (raw && !DOMAIN_RE.test(raw)) return res.status(400).json({ error: 'Enter a valid domain, e.g. cms.acmeco.com' });
    const featureFlags = { ...(req.org.feature_flags || {}), custom_domain_request: raw || null };
    await storage.orgs.update(req.org.id, { featureFlags });
    await auditFor(req.org.id, req.viewer)(raw ? 'Requested custom domain' : 'Cleared custom domain request', raw || undefined);
    res.json({ success: true, feature_flags: featureFlags });
  } catch (e) { next(e); }
});

// ================= COMMERCE + OPS =================

mountCommerceApi(app);
mountOpsApi(app);
mountNexusApi(app);
mountSuperAdminApi(app);
mountBlockCatalogApi(app);

// ================= PAGES =================

app.get('/api/pages', requireOrg, async (req, res, next) => {
  try {
    await applyDueSchedules(req.org.id);
    const [pages, globalSettings] = await Promise.all([
      storage.pages.list(req.org.id),
      storage.settings.get(req.org.id),
    ]);
    res.json({ pages, globalSettings });
  } catch (e) { next(e); }
});

app.post('/api/pages', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const { pages, globalSettings: incomingGlobalSettings } = req.body;
    if (!pages || !Array.isArray(pages)) return res.status(400).json({ error: 'Invalid pages data structure' });
    if (pagesContainScriptBlock(pages) && req.viewer?.role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace admins can save a page containing a Script block.' });
    }
    if (pagesContainFullHtmlMode(pages) && req.viewer?.role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace admins can save a page in Full HTML mode.' });
    }
    const cleanPages = pages.map(sanitizePage);
    const oldPages = await storage.pages.list(req.org.id);
    await storage.versions.snapshot(req.org.id, oldPages, cleanPages);
    const written = await storage.pages.bulkReplace(req.org.id, cleanPages);
    let updatedGlobals;
    if (incomingGlobalSettings && req.viewer?.role === 'admin') {
      updatedGlobals = await storage.settings.replace(req.org.id, sanitizeGlobalSettings(incomingGlobalSettings));
    } else {
      updatedGlobals = await storage.settings.get(req.org.id);
    }
    const createdCount = cleanPages.filter(p => !oldPages.find(o => o.id === p.id)).length;
    const deletedCount = oldPages.filter(o => !cleanPages.find(p => p.id === o.id)).length;
    const changedCount = cleanPages.length - createdCount;
    if (createdCount || deletedCount || changedCount) {
      const parts = [];
      if (createdCount) parts.push(`${createdCount} created`);
      if (changedCount) parts.push(`${changedCount} updated`);
      if (deletedCount) parts.push(`${deletedCount} deleted`);
      await auditFor(req.org.id, req.viewer)('Saved pages', parts.join(', '));
    }
    res.json({ success: true, pages: written, globalSettings: updatedGlobals });
  } catch (e) { next(e); }
});

// ================= DRAFT PREVIEWS (signed) =================

// Draft previews used to be `?preview=1` -- anyone who guessed a URL could
// read unpublished content. Now the editor's "Open preview" button fetches
// a short-lived HMAC token here (org-authenticated), and the public-site
// handler below only serves a non-published page when the token verifies.
// The token is bound to one pageId + expiry; possession proves an
// authorized editor generated it, so the public handler needs no session.
const PREVIEW_SECRET = process.env.PREVIEW_TOKEN_SECRET || process.env.CLERK_SECRET_KEY || 'dev-preview-secret';
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function signPreviewToken(pageId, exp) {
  return crypto.createHmac('sha256', PREVIEW_SECRET).update(`${pageId}:${exp}`).digest('base64url');
}

function verifyPreviewToken(pageId, token) {
  if (!token || typeof token !== 'string') return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  const expected = signPreviewToken(pageId, exp);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

app.get('/api/preview-token/:pageId', requireOrg, (req, res) => {
  const exp = Date.now() + PREVIEW_TTL_MS;
  res.json({ token: `${exp}.${signPreviewToken(req.params.pageId, exp)}` });
});

// Nexus's own pages get the same treatment via the super-admin surface.
app.get('/api/nexus/preview-token/:pageId', requireSuperAdmin, (req, res) => {
  const exp = Date.now() + PREVIEW_TTL_MS;
  res.json({ token: `${exp}.${signPreviewToken(req.params.pageId, exp)}` });
});

// ================= VERSIONS =================

app.get('/api/versions/:pageId', requireOrg, async (req, res, next) => {
  try { res.json(await storage.versions.listForPage(req.org.id, req.params.pageId)); }
  catch (e) { next(e); }
});

app.post('/api/versions/:pageId/:versionId/restore', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const version = await storage.versions.get(req.org.id, req.params.pageId, req.params.versionId);
    if (!version) return res.status(404).json({ error: 'Version not found' });
    const pages = await storage.pages.list(req.org.id);
    const targetIndex = pages.findIndex(p => p.id === req.params.pageId);
    if (targetIndex === -1) return res.status(404).json({ error: 'Page no longer exists' });
    const next = pages.map((p, i) => i === targetIndex ? version.snapshot : p);
    await storage.versions.snapshot(req.org.id, pages, next);
    const written = await storage.pages.bulkReplace(req.org.id, next);
    await auditFor(req.org.id, req.viewer)('Restored version', `Page "${version.snapshot.name}" restored from ${new Date(version.timestamp).toLocaleString()}`);
    res.json({ success: true, pages: written });
  } catch (e) { next(e); }
});

// ================= AI (paste-in block classification) =================

// Classifies one pasted HTML block for the page editor's "Paste in" import
// flow (see segment.js on the client). Only called for blocks the
// deterministic heuristics couldn't confidently label. Costs real money per
// call, so it's rate-limited on top of the normal editor role gate. Returns
// 501 (matches the deferred501 pattern below) when ANTHROPIC_API_KEY isn't
// configured -- the client falls back to importing the block as `unknown`.
app.post('/api/ai/classify-block', requireOrg, requireRole('editor'), aiClassifyLimit, async (req, res, next) => {
  try {
    if (!hasAnthropicKey()) {
      return res.status(501).json({ error: 'AI classification is not configured on this deployment.' });
    }
    const { html } = req.body;
    if (typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ error: 'html is required' });
    }
    const result = await classifyBlock(html);
    res.json(result);
  } catch (e) { next(e); }
});

// ================= AUDIT + LIBRARY =================

app.get('/api/audit', requireOrg, async (req, res, next) => {
  try { res.json(await storage.audit.list(req.org.id)); } catch (e) { next(e); }
});

app.get('/api/library', requireOrg, async (req, res, next) => {
  try { res.json(await storage.library.list(req.org.id)); } catch (e) { next(e); }
});

app.post('/api/library', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'Invalid library data structure' });
    const clean = entries.map(e => ({ ...e, html: sanitizeContentHtml(e?.html || '') }));
    const written = await storage.library.bulkReplace(req.org.id, clean);
    res.json({ success: true, library: written });
  } catch (e) { next(e); }
});

// ================= REDIRECTS =================

app.get('/api/redirects', requireOrg, async (req, res, next) => {
  try { res.json(await storage.redirects.list(req.org.id)); } catch (e) { next(e); }
});

app.post('/api/redirects', requireOrg, requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to, type } = req.body;
    const cleanFrom = String(from ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const cleanTo = (to || '').trim();
    if (!cleanFrom || !cleanTo) return res.status(400).json({ error: 'from and to are required' });
    const existing = await storage.redirects.getByFrom(req.org.id, cleanFrom);
    if (existing) return res.status(400).json({ error: `A redirect from "/${cleanFrom}" already exists.` });
    const entry = { id: 'redir-' + Date.now(), from: cleanFrom, to: cleanTo, type: Number(type) === 301 ? 301 : 302 };
    await storage.redirects.add(req.org.id, entry);
    await auditFor(req.org.id, req.viewer)('Added redirect', `/${cleanFrom} -> ${cleanTo}`);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.delete('/api/redirects/:id', requireOrg, requireRole('admin'), async (req, res, next) => {
  try {
    const removed = await storage.redirects.remove(req.org.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Redirect not found' });
    await auditFor(req.org.id, req.viewer)('Deleted redirect', `/${removed.from} -> ${removed.to}`);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ================= SECTION COMMENTS =================

app.get('/api/comments', requireOrg, async (req, res, next) => {
  try { res.json(await storage.comments.list(req.org.id, req.query.pageId)); } catch (e) { next(e); }
});

app.post('/api/comments', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const { pageId, sectionId, text, author } = req.body;
    if (!pageId || !sectionId || !text?.trim()) return res.status(400).json({ error: 'pageId, sectionId, and text are required' });
    const entry = await storage.comments.add(req.org.id, {
      id: 'comment-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      pageId, sectionId, text: text.trim(),
      author: author || req.viewer?.email || 'anonymous',
    });
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.patch('/api/comments/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const entry = await storage.comments.setResolved(req.org.id, req.params.id, !!req.body.resolved);
    if (!entry) return res.status(404).json({ error: 'Comment not found' });
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.delete('/api/comments/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
  try { await storage.comments.remove(req.org.id, req.params.id); res.json({ success: true }); }
  catch (e) { next(e); }
});

// ================= A/B TESTING =================

app.post('/api/ab-track', abTrackLimit, requireOrg, async (req, res, next) => {
  try {
    const { sectionId, variantId, event } = req.body;
    if (!sectionId || !variantId || event !== 'click') {
      return res.status(400).json({ error: 'sectionId, variantId, and event="click" are required' });
    }
    await storage.abStats.record(req.org.id, sectionId, variantId, 'clicks');
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.get('/api/ab-stats/:sectionId', requireOrg, async (req, res, next) => {
  try { res.json(await storage.abStats.forSection(req.org.id, req.params.sectionId)); } catch (e) { next(e); }
});

// ================= TEAM ROSTER =================

app.get('/api/team', requireOrg, async (req, res, next) => {
  try { res.json(await storage.team.list(req.org.id)); } catch (e) { next(e); }
});

app.post('/api/team', requireOrg, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, email, role } = req.body;
    if (!name?.trim() || !email?.trim() || !['viewer', 'editor', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'name, email, and a valid role are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const entry = await storage.team.add(req.org.id, {
      id: 'team-' + Date.now(), name: name.trim(), email: cleanEmail, role,
    });
    // Real membership row (what resolveViewer actually checks) + a real
    // Clerk invitation email. Previously this route only wrote the roster
    // row while the UI implied an invite email had been sent -- the invite
    // was actually a manual Clerk-dashboard step.
    await storage.orgMembers.add(req.org.id, cleanEmail, role).catch(() => {});
    let invited = false;
    try {
      await clerkClient.invitations.createInvitation({
        emailAddress: cleanEmail,
        redirectUrl: `https://${req.headers.host}/${req.org.id}`,
        notify: true,
        ignoreExisting: true,
      });
      invited = true;
    } catch {
      // Already invited / already a Clerk user / Clerk hiccup -- the
      // membership row above still lets them in once they can sign in.
    }
    await auditFor(req.org.id, req.viewer)('Added team member', `${entry.name} <${entry.email}> as ${entry.role}`);
    res.json({ success: true, entry, invited });
  } catch (e) { next(e); }
});

app.delete('/api/team/:id', requireOrg, requireRole('admin'), async (req, res, next) => {
  try {
    const removed = await storage.team.remove(req.org.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Team member not found' });
    await auditFor(req.org.id, req.viewer)('Removed team member', `${removed.name} <${removed.email}>`);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ================= MEDIA =================

// Media files live in a public Supabase Storage bucket, one folder per
// org, with metadata rows in the existing `media` table. The bucket is
// created lazily on first upload (service-role client can manage
// buckets), so no manual Supabase setup step is needed.
const MEDIA_BUCKET = 'media';
const MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MEDIA_MIME_ALLOWLIST = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml',
  'application/pdf', 'video/mp4', 'video/webm', 'audio/mpeg',
]);

let mediaBucketReady = false;
async function ensureMediaBucket() {
  if (mediaBucketReady) return;
  // createBucket errors if it already exists -- that's fine, both paths
  // leave the bucket present.
  await db().storage.createBucket(MEDIA_BUCKET, { public: true }).catch(() => {});
  mediaBucketReady = true;
}

app.get('/api/media', requireOrg, async (req, res, next) => {
  try { res.json(await storage.media.list(req.org.id)); } catch (e) { next(e); }
});

app.post('/api/media', express.json({ limit: '15mb' }), requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const { name, mimeType, dataBase64 } = req.body || {};
    if (!name || !mimeType || !dataBase64) return res.status(400).json({ error: 'name, mimeType, and dataBase64 are required' });
    if (!MEDIA_MIME_ALLOWLIST.has(mimeType)) return res.status(400).json({ error: `File type ${mimeType} isn't supported.` });
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
    if (buffer.length > MEDIA_MAX_BYTES) return res.status(400).json({ error: 'Files must be 10 MB or smaller.' });

    await ensureMediaBucket();
    const id = 'media-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const safeName = String(name).replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const storagePath = `${req.org.id}/${id}-${safeName}`;

    const { error: uploadError } = await db().storage.from(MEDIA_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, cacheControl: '31536000' });
    if (uploadError) return res.status(500).json({ error: 'Upload failed. Please try again or contact support.' });

    const { data: pub } = db().storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
    const entry = await storage.media.add(req.org.id, {
      id, name: String(name).slice(0, 200), filename: storagePath,
      mimeType, size: buffer.length, url: pub.publicUrl,
    });
    await auditFor(req.org.id, req.viewer)('Uploaded media', `${entry.name} (${(buffer.length / 1024).toFixed(0)} KB)`);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.delete('/api/media/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const removed = await storage.media.remove(req.org.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'File not found' });
    if (removed.filename) {
      await db().storage.from(MEDIA_BUCKET).remove([removed.filename]).catch(() => {});
    }
    await auditFor(req.org.id, req.viewer)('Deleted media', removed.name || req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ================= FORMS =================

// Public submission endpoint for the Contact Form / Newsletter blocks.
// The org is resolved from the request host (same rule as public-page
// rendering); the `_hp` honeypot silently accepts-and-drops bot fills so
// bots don't learn they were caught. Responds with a minimal thank-you
// page (plain HTML form POST, works without any client JS under the
// public site's strict CSP).
const formsLimit = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
const FORM_THANKS_HTML = (backHref) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Thanks</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>body{background:#070a13;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}
.box{max-width:420px;padding:24px;} h1{font-size:22px;margin-bottom:8px;} p{color:#a1a1aa;font-size:14px;}
a{color:#a5b4fc;}</style></head>
<body><div class="box"><h1>Thanks — got it.</h1><p>Your message has been sent.</p><p><a href="${backHref}">&larr; Back</a></p></div></body></html>`;

async function orgIdForHost(host) {
  const orgs = await storage.orgs.list();
  const matched = orgs.find((o) => o.domain && o.domain === host);
  if (matched) return matched.paused ? null : matched.id;
  const explicitDefault = process.env.DEFAULT_PUBLIC_ORG_ID || process.env.PUBLIC_ORG_ID;
  if (explicitDefault) {
    const org = orgs.find((o) => o.id === explicitDefault);
    return org?.paused ? null : explicitDefault;
  }
  return null;
}

app.post('/api/public/forms', formsLimit, express.urlencoded({ extended: false, limit: '32kb' }), async (req, res, next) => {
  try {
    let backHref = '/';
    try {
      const refPath = new URL(req.headers.referer).pathname;
      if (/^\/[^/]*$/.test(refPath) || /^\/[^/].*/.test(refPath)) backHref = refPath;
    } catch { /* no/malformed referer -- link back to the homepage */ }
    const { _form, _hp, ...fields } = req.body || {};
    // Honeypot filled -> pretend success, store nothing.
    if (_hp) return res.status(200).send(FORM_THANKS_HTML(backHref));

    const orgId = await orgIdForHost(req.headers.host);
    if (!orgId) return res.status(404).json({ error: 'Not found' });

    const entries = Object.entries(fields)
      .filter(([k, v]) => typeof v === 'string' && k.length <= 64)
      .slice(0, 20)
      .map(([k, v]) => [k, v.slice(0, 5000)]);
    if (entries.length === 0) return res.status(400).json({ error: 'Empty submission' });

    const entry = await storage.forms.add(orgId, {
      id: 'form-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      formName: String(_form || 'Contact form').slice(0, 100),
      pagePath: backHref.replace(/^\//, ''),
      fields: Object.fromEntries(entries),
    });

    // Best-effort admin notification; never blocks the response.
    storage.forms.adminEmails(orgId)
      .then(async (to) => {
        const settings = await storage.settings.get(orgId).catch(() => null);
        return sendFormNotification({ to, orgName: settings?.siteName || orgId, formName: entry.formName, pagePath: entry.pagePath, fields: entry.fields });
      })
      .catch(() => {});

    res.status(200).send(FORM_THANKS_HTML(backHref));
  } catch (e) { next(e); }
});

app.get('/api/forms', requireOrg, async (req, res, next) => {
  try { res.json(await storage.forms.list(req.org.id)); } catch (e) { next(e); }
});

app.patch('/api/forms/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    await storage.forms.markRead(req.org.id, req.params.id, req.body?.read !== false);
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.delete('/api/forms/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    await storage.forms.remove(req.org.id, req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ================= FEEDBACK =================

app.get('/api/feedback', requireOrg, async (req, res, next) => {
  try { res.json(await storage.feedback.list(req.org.id)); } catch (e) { next(e); }
});

app.post('/api/feedback', feedbackLimit, feedbackJson, requireOrg, async (req, res, next) => {
  try {
    const { type, description, expectedBehavior, currentBehavior, urgent, area, path: reportPath } = req.body;
    const VALID_TYPES = ['bug', 'non_functioning', 'critical', 'feature_request'];
    if (!VALID_TYPES.includes(type) || !description?.trim()) {
      return res.status(400).json({ error: 'A valid type and a description are required' });
    }
    const entry = await storage.feedback.add(req.org.id, {
      id: 'feedback-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      type, description: description.trim(),
      expectedBehavior: expectedBehavior || '', currentBehavior: currentBehavior || '',
      urgent: !!urgent, area: area === 'commerce' ? 'commerce' : 'cms', path: reportPath || '',
      reportedRole: req.viewer?.role || 'anonymous', reportedBy: req.viewer?.email || null,
      screenshotUrl: null, imageUrls: [],
    });
    await auditFor(req.org.id, req.viewer)('Feedback submitted', `${type}${urgent ? ' (urgent)' : ''} on ${entry.path}`);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.patch('/api/feedback/:id', requireOrg, requireRole('editor'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const VALID_STATUSES = ['open', 'acknowledged', 'in_progress', 'sent_to_agent', 'resolved', 'closed'];
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const entry = await storage.feedback.updateStatus(req.org.id, req.params.id, status);
    if (!entry) return res.status(404).json({ error: 'Feedback ticket not found' });
    await auditFor(req.org.id, req.viewer)('Feedback status changed', `${entry.type} ticket -> ${status}`);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

// ================= ORG MANAGEMENT (super-admin only) =================

// List every org in the system. Only visible to super-admins (ADMIN_EMAILS).
app.get('/api/orgs', requireSuperAdmin, async (req, res, next) => {
  try { res.json(await storage.orgs.list()); } catch (e) { next(e); }
});

// Create a new org and add its first admin. This is the one-click
// "onboard a client" surface — server does the schema-side work, admin
// still has to send the Clerk invite from the dashboard (or we hook up
// Clerk's invite API here later).
app.post('/api/orgs', requireSuperAdmin, async (req, res, next) => {
  try {
    const { id, name, domain, plan, featureFlags, adminEmail, templateId } = req.body || {};
    if (!id?.trim() || !name?.trim()) return res.status(400).json({ error: 'id and name are required' });
    const slug = String(id).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await storage.orgs.get(slug);
    if (existing) return res.status(400).json({ error: `An org with slug "${slug}" already exists.` });
    const org = await storage.orgs.create({ id: slug, name: name.trim(), domain, plan, featureFlags });
    if (adminEmail?.trim()) {
      const cleanEmail = adminEmail.trim().toLowerCase();
      await storage.orgMembers.add(slug, cleanEmail, 'admin');
      // Best-effort Clerk invite email so they can actually sign in --
      // previously a manual Clerk-dashboard step.
      await clerkClient.invitations.createInvitation({
        emailAddress: cleanEmail,
        redirectUrl: `https://${req.headers.host}/${slug}`,
        notify: true,
        ignoreExisting: true,
      }).catch(() => {});
    }
    // Optional starter site: full multi-page template built from the block
    // system, published immediately, plus its matching theme -- so the
    // workspace's first login shows a working site, not an empty list.
    if (templateId) {
      const site = buildTemplateSite(templateId);
      if (!site) return res.status(400).json({ error: `Unknown template "${templateId}"` });
      await storage.pages.bulkReplace(slug, site.pages.map(sanitizePage));
      const settings = await storage.settings.get(slug);
      await storage.settings.replace(slug, sanitizeGlobalSettings({ ...settings, siteName: name.trim(), theme: site.theme }));
      await storage.audit.append(slug, 'Starter site applied', `Template: ${templateId}`);
    }
    await storage.audit.append(slug, 'Workspace created', `Created by ${req.viewer?.email || 'unknown'}`);
    res.json({ success: true, org });
  } catch (e) { next(e); }
});

// List of available starter templates (id/name/description only) -- used
// by both the super-admin workspace-creation UI and the self-serve
// /welcome flow, so any signed-in user may read it.
app.get('/api/site-templates', requireAuth, (_req, res) => {
  res.json(SITE_TEMPLATES.map(({ id, name, description }) => ({ id, name, description })));
});

// ================= SELF-SERVE SIGNUP =================

// A signed-in user with no workspace creates their own here (the /welcome
// page). One workspace per email via self-serve -- agencies needing more
// go through Super Admin (or, later, the Agency plan's own flow). Slug
// squats on reserved route names are rejected.
const RESERVED_SLUGS = new Set(['admin', 'api', 'assets', 'super-admin', 'welcome', 'commerce', 'nexus', 'www', 'pricing', 'blocks']);
const signupLimit = rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false });

app.post('/api/signup/workspace', signupLimit, requireAuth, async (req, res, next) => {
  try {
    if (req.org) return res.status(400).json({ error: 'This account already has a workspace.' });
    const { name, slug: rawSlug, templateId } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'A workspace name is required.' });
    const slug = String(rawSlug || name).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!slug || RESERVED_SLUGS.has(slug)) return res.status(400).json({ error: 'That workspace URL isn\'t available -- try another.' });
    if (await storage.orgs.get(slug)) return res.status(400).json({ error: 'That workspace URL is taken -- try another.' });

    const org = await storage.orgs.create({
      id: slug, name: name.trim(), plan: 'starter',
      featureFlags: { trial_ends_at: Date.now() + 14 * 24 * 60 * 60 * 1000 },
    });
    await storage.orgMembers.add(slug, req.viewer.email.toLowerCase(), 'admin');
    if (templateId) {
      const site = buildTemplateSite(templateId);
      if (site) {
        await storage.pages.bulkReplace(slug, site.pages.map(sanitizePage));
        const settings = await storage.settings.get(slug);
        await storage.settings.replace(slug, sanitizeGlobalSettings({ ...settings, siteName: name.trim(), theme: site.theme }));
      }
    }
    await storage.audit.append(slug, 'Workspace created', 'Self-serve signup');
    res.json({ success: true, org: { id: org.id, slug: org.id, name: org.name } });
  } catch (e) { next(e); }
});

// ================= PLATFORM BILLING (Nexus's own plans) =================

app.post('/api/billing/checkout', requireOrg, requireRole('admin'), async (req, res, next) => {
  try {
    const { plan, interval } = req.body || {};
    const session = await createCheckoutSession({
      orgId: req.org.id, plan, interval,
      email: req.viewer?.email,
      origin: `https://${req.headers.host}`,
    });
    res.json({ url: session.url });
  } catch (e) { next(e); }
});

app.post('/api/billing/portal', requireOrg, requireRole('admin'), async (req, res, next) => {
  try {
    const customerId = req.org.feature_flags?.subscription?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No subscription on this workspace yet.' });
    const session = await createPortalSession({ customerId, orgId: req.org.id, origin: `https://${req.headers.host}` });
    res.json({ url: session.url });
  } catch (e) { next(e); }
});

app.get('/api/billing/status', requireOrg, (req, res) => {
  const flags = req.org.feature_flags || {};
  res.json({
    plan: req.org.plan || 'starter',
    subscription: flags.subscription || null,
    trialEndsAt: flags.trial_ends_at || null,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, label: p.label, monthly: p.monthly, annual: p.annual })),
  });
});

app.patch('/api/orgs/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const org = await storage.orgs.update(req.params.id, req.body || {});
    res.json({ success: true, org });
  } catch (e) { next(e); }
});

app.delete('/api/orgs/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    if (req.params.id === 'admin') return res.status(400).json({ error: "Refusing to delete the bootstrap 'admin' org." });
    await storage.orgs.remove(req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.get('/api/orgs/:id/members', requireSuperAdmin, async (req, res, next) => {
  try { res.json(await storage.orgMembers.listForOrg(req.params.id)); } catch (e) { next(e); }
});

app.post('/api/orgs/:id/members', requireSuperAdmin, async (req, res, next) => {
  try {
    const { email, role } = req.body || {};
    if (!email?.trim() || !['viewer', 'editor', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'email and a valid role are required' });
    }
    const row = await storage.orgMembers.add(req.params.id, email.trim().toLowerCase(), role);
    res.json({ success: true, member: row });
  } catch (e) { next(e); }
});

// JSON export of everything content-shaped for one workspace -- a data
// backup, not a rebuildable static site (no rendered HTML). Serves the
// same "get my data out" need the stubbed/disabled POST /api/export
// below was meant for, before it was shelved during the Supabase
// migration and never finished.
app.get('/api/orgs/:id/backup', requireSuperAdmin, async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const org = await storage.orgs.get(orgId);
    if (!org) return res.status(404).json({ error: 'Workspace not found' });
    const [pages, library, redirects, settings] = await Promise.all([
      storage.pages.list(orgId),
      storage.library.list(orgId),
      storage.redirects.list(orgId),
      storage.settings.get(orgId),
    ]);
    const backup = {
      exportedAt: new Date().toISOString(),
      org: { id: org.id, name: org.name, domain: org.domain, plan: org.plan },
      pages, library, redirects, settings,
    };
    res.setHeader('Content-Disposition', `attachment; filename="${orgId}-backup-${Date.now()}.json"`);
    res.json(backup);
  } catch (e) { next(e); }
});

// Usage counts for the Billing page -- see storage.usageForOrg's own
// comment on why this is a counts proxy, not real bandwidth metering.
app.get('/api/orgs/:id/usage', requireSuperAdmin, async (req, res, next) => {
  try { res.json(await storage.usageForOrg(req.params.id)); }
  catch (e) { next(e); }
});

app.delete('/api/orgs/:id/members/:email', requireSuperAdmin, async (req, res, next) => {
  try {
    await storage.orgMembers.remove(req.params.id, req.params.email);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ================= DEFERRED SURFACES (501) =================

const deferred501 = (msg) => (_req, res) => res.status(501).json({ error: msg });
app.get('/api/export/csv/:type', deferred501('CSV export is temporarily disabled during the storage migration.'));
app.get('/api/export/csv/:type/template', deferred501('CSV export is temporarily disabled during the storage migration.'));
app.post('/api/import/csv/:type', deferred501('CSV import is temporarily disabled during the storage migration.'));
app.post('/api/export', deferred501('Static site export is temporarily disabled during the storage migration.'));

// ================= DYNAMIC PAGE RENDER =================

const nexusSite = () => ({
  // The platform host (nexus.comleycreative.com) is a hybrid: some paths
  // are real published marketing pages (/, /pricing), but most top-level
  // paths are SPA app routes (/welcome, /admin, /super-admin, and every
  // /:orgSlug workspace). isPlatform tells the render handler to fall
  // back to the SPA shell for an unmatched path instead of redirecting to
  // "/" -- without it, self-serve signups at /:slug and /welcome never
  // load. Client custom domains are pure published sites and keep the
  // redirect-to-homepage behavior.
  isPlatform: true,
  findRedirect: (p) => nexus.redirects.findMatch(p),
  applySchedules: () => nexus.pages.applyScheduledPublishes(),
  loadPages: () => nexus.pages.list(),
  loadLibrary: () => nexus.library.list(),
  loadSettings: () => nexus.settings.get(),
  recordImpression: async () => {}, // no A/B wiring for Nexus's own site in v1
});

// The built SPA shell (dist/index.html), read once and cached. Served for
// unmatched app routes on the platform host so client-side routing can
// take over. Returns null if the build output isn't present (e.g. API-only
// local run) so callers fall back to the old redirect.
let cachedShell;
function spaShell() {
  if (cachedShell !== undefined) return cachedShell;
  try {
    cachedShell = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8');
  } catch {
    cachedShell = null;
  }
  return cachedShell;
}

const orgSite = (orgId, paused) => ({
  paused: !!paused,
  findRedirect: (p) => storage.redirects.findMatch(orgId, p),
  applySchedules: () => applyDueSchedules(orgId),
  loadPages: () => storage.pages.list(orgId),
  loadLibrary: () => storage.library.list(orgId),
  loadSettings: () => storage.settings.get(orgId),
  recordImpression: (sectionId, variantId) => storage.abStats.record(orgId, sectionId, variantId, 'impressions'),
});

// Deliberately generic -- never reveals that the underlying reason is a
// paused workspace, matching the same client-facing takeover used for
// paused API calls (see requireOrg in this file / lib/ops/routes.js).
const PAUSED_SITE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Unavailable</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>body{background:#070a13;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}
.box{max-width:420px;padding:24px;}
h1{font-size:22px;margin-bottom:8px;}
p{color:#a1a1aa;font-size:14px;}</style></head>
<body><div class="box"><h1>Something went wrong</h1><p>This site is temporarily unavailable. Please contact support if you believe this is an error.</p></div></body></html>`;

// Resolves which site's content to render for an incoming public request:
//   - Host matches an org's `domain` column -> that org's own content (a
//     client only takes over a hostname once they've configured a domain).
//   - Host === DEFAULT_PUBLIC_ORG_ID's explicit override -> that org, if set.
//   - Otherwise -> Nexus's own site (lib/nexus.js). This is the front door
//     everyone lands on before signing up for a workspace, including on
//     the bare nexus.comleycreative.com host until a client claims it.
async function resolvePublicSite(host) {
  const orgs = await storage.orgs.list();
  const matched = orgs.find((o) => o.domain && o.domain === host);
  if (matched) return orgSite(matched.id, matched.paused);

  const explicitDefault = process.env.DEFAULT_PUBLIC_ORG_ID || process.env.PUBLIC_ORG_ID;
  if (explicitDefault) {
    const org = orgs.find((o) => o.id === explicitDefault);
    return orgSite(explicitDefault, org?.paused);
  }

  return nexusSite();
}

// Search-engine plumbing for every hosted site: sitemap lists published
// pages only (drafts stay invisible), robots points at it.
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const site = await resolvePublicSite(req.headers.host);
    if (site.paused) return res.status(404).end();
    const pages = await site.loadPages();
    const origin = `https://${req.headers.host}`;
    const urls = pages
      .filter((p) => p.status === 'published')
      .map((p) => `  <url><loc>${origin}/${getFullPath(p, pages)}</loc></url>`.replace(/\/<\/loc>/, '</loc>'))
      .join('\n');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  } catch (e) { next(e); }
});

app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.send(`User-agent: *\nAllow: /\n\nSitemap: https://${req.headers.host}/sitemap.xml\n`);
});

// Inline <script> bodies (Script blocks, pasted analytics snippets) need
// their hashes in script-src -- 'self' alone silently blocks them, which
// would make the Script block feature dead on arrival in production.
// Hashing each body keeps the CSP strict instead of falling back to
// 'unsafe-inline'.
function inlineScriptHashes(html) {
  const hashes = [];
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) hashes.push(`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  return hashes.join(' ');
}

app.use(async (req, res, next) => {
  try {
    // HEAD included: uptime monitors and some crawlers probe with HEAD,
    // and Express automatically omits the body for them -- only handling
    // GET made every public page 404 to those probes.
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const requestPath = req.path.split('/').filter(Boolean).join('/');
    if (requestPath.startsWith('api') || requestPath.includes('.')) return next();

    const site = await resolvePublicSite(req.headers.host);
    if (site.paused) return res.status(423).send(PAUSED_SITE_HTML);

    const redirect = await site.findRedirect(requestPath);
    if (redirect) {
      const isAbsoluteOrRooted = /^https?:\/\//i.test(redirect.to) || redirect.to.startsWith('/');
      return res.redirect(redirect.type || 302, isAbsoluteOrRooted ? redirect.to : '/' + redirect.to);
    }

    await site.applySchedules();
    const [pages, library, globalSettings] = await Promise.all([
      site.loadPages(),
      site.loadLibrary(),
      site.loadSettings(),
    ]);

    const page = requestPath === ''
      ? (pages.find(p => p.slug === 'index') || pages[0])
      : pages.find(p => getFullPath(p, pages) === requestPath);

    // On the platform host, an unmatched (or unpublished) path is almost
    // always an SPA app route -- serve the shell and let client routing
    // handle it. On client custom domains, keep redirecting to home.
    const serveShellOrRedirect = () => {
      const shell = site.isPlatform && spaShell();
      if (shell) return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(shell);
      return res.redirect(302, '/');
    };

    if (!page) return serveShellOrRedirect();
    // Unpublished pages are only served with a valid signed preview token
    // (see /api/preview-token/:pageId above). The old `?preview=1` served
    // drafts to anyone who guessed the URL.
    const isPreview = verifyPreviewToken(page.id, req.query.preview);
    if (page.status !== 'published' && !isPreview) return serveShellOrRedirect();

    const cookies = (req.headers.cookie || '').split(';').reduce((acc, pair) => {
      const idx = pair.indexOf('='); if (idx === -1) return acc;
      acc[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
      return acc;
    }, {});
    const abChoices = {};
    for (const section of page.content || []) {
      if (!Array.isArray(section.abVariants) || section.abVariants.length === 0) continue;
      const cookieKey = `ab_${section.id}`;
      const existing = section.abVariants.find(v => v.id === cookies[cookieKey]);
      const variant = existing || pickWeightedVariant(section.abVariants);
      abChoices[section.id] = variant.id;
      if (!existing) res.cookie(cookieKey, variant.id, { maxAge: 30 * 24 * 60 * 60 * 1000 });
      await site.recordImpression(section.id, variant.id);
    }

    const renderedHtml = compilePageHtml(page, pages, library, globalSettings, abChoices, `https://${req.headers.host}`);
    const analyticsHosts = process.env.ANALYTICS_HOSTS || '';
    res.setHeader('Content-Security-Policy', [
      `default-src 'self'`,
      // Inline hashes: Script blocks + inline analytics snippets would be
      // silently blocked by 'self' alone. Hashed per-response, stays strict.
      `script-src 'self' ${analyticsHosts} ${inlineScriptHashes(renderedHtml)}`.trim(),
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: https:`,
      `font-src 'self' data:`,
      `connect-src 'self' ${analyticsHosts}`,
      // Video Embed block: default-src 'self' was blocking YouTube/Vimeo
      // iframes entirely in production.
      `frame-src https://www.youtube.com https://player.vimeo.com`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // CDN caching for published pages: Vercel's edge absorbs repeat views
    // without touching Express/Supabase. Skipped for previews (private
    // drafts) and A/B pages (per-visitor variant cookies must not be
    // cached and impressions must be counted per view).
    const hasAb = Object.keys(abChoices).length > 0;
    if (!isPreview && !hasAb) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    res.send(renderedHtml);
  } catch (e) { next(e); }
});

Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, _next) => {
  console.error('[unhandled]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;

const inServerless = process.env.SERVERLESS || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
if (!inServerless) {
  app.listen(PORT, () => {
    console.log(`CMS Backend running on port ${PORT}`);
    console.log(`- API endpoints starting with: http://localhost:${PORT}/api`);
    console.log(`- Live pages available at: http://localhost:${PORT}/{slug}`);
  });
}
