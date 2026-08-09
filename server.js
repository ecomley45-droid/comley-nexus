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
import { applyResponsiveImages, buildMediaIndex } from './src/shared/responsiveImages.js';
import { renderModelFrame, modelFrameCsp } from './lib/modelFrame.js';
import { tourFrameSrc } from './src/shared/tourProviders.js';

// The srcset pass needs the org's media on every public page render, and
// media.list is unbounded — one row per upload, forever. Fetching all of it
// per request is a query whose cost grows with the library and has nothing to
// do with the page being served, so it is cached briefly per org.
//
// 60 seconds is chosen against what actually goes wrong: a freshly uploaded
// image renders without a srcset for up to a minute, which costs one visitor
// some bytes. The alternative — a full media read on every request — costs
// every visitor.
const MEDIA_INDEX_TTL_MS = 60_000;
const mediaIndexCache = new Map();

async function mediaIndexFor(orgId) {
  const hit = mediaIndexCache.get(orgId);
  if (hit && hit.expires > Date.now()) return hit.index;
  const index = buildMediaIndex(await storage.media.list(orgId));
  mediaIndexCache.set(orgId, { index, expires: Date.now() + MEDIA_INDEX_TTL_MS });
  // Bound the map itself: one entry per org that has served a page since the
  // process started, which on a shared instance is otherwise unbounded too.
  if (mediaIndexCache.size > 200) {
    for (const key of mediaIndexCache.keys()) {
      if (mediaIndexCache.size <= 100) break;
      mediaIndexCache.delete(key);
    }
  }
  return index;
}
import { mountCommerceWebhooks, mountCommerceApi } from './lib/commerce/routes.js';
import { mountOpsApi } from './lib/ops/routes.js';
import { mountNexusApi } from './lib/nexusRoutes.js';
import { mountSuperAdminApi } from './lib/superAdminRoutes.js';
import { mountBlockCatalogApi } from './lib/blockCatalogRoutes.js';
import { mountMarketplaceApi } from './lib/marketplaceRoutes.js';
import { mountEventsApi } from './lib/eventsRoutes.js';
import { hydrateEventBlocks } from './lib/eventsHydrate.js';
import { registerCollectionRoutes } from './lib/collectionsRoutes.js';
import { registerVersionRoutes } from './lib/routes/versions.js';
import { registerLibraryAuditRoutes } from './lib/routes/libraryAudit.js';
import { registerRedirectRoutes } from './lib/routes/redirects.js';
import { registerCommentRoutes } from './lib/routes/comments.js';
import { registerAbRoutes } from './lib/routes/abTesting.js';
import { registerTeamRoutes } from './lib/routes/team.js';
import { registerRoleRoutes } from './lib/routes/roles.js';
import { registerMediaRoutes } from './lib/routes/media.js';
import { hydrateCollectionBlocks, resolveCollectionDetail, buildDetailPage, hydrateLanguageBlocks } from './lib/collectionsHydrate.js';
import { editableView } from './src/shared/pageDrafts.js';
import { splitLocalePath, localizedPage, localizedPath, localesOf, isMultilingual } from './src/shared/i18n.js';
import { buildSearchIndex, searchIndex, highlight } from './src/shared/siteSearch.js';
import * as collections from './lib/collections.js';
import { mountSocialApi } from './lib/social/routes.js';
import { injectSocialFeeds } from './lib/social/feed.js';
import { mountEmailApi } from './lib/email/routes.js';
import {
  attachClerk, resolveViewer, requireRole, requirePermission, requireOrgMatch, requireSuperAdmin,
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
import { generateSite } from './lib/aiSiteGen.js';
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

// Everything the extracted route modules in lib/routes/ need. Passed in
// rather than imported by each module so there is exactly one definition of
// each guard, and so a module can't quietly reach for something it wasn't
// given.
let routeContext;

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
    // Resolved RBAC matrix for nav gating + client-side page guards. Enforced
    // independently on the server (requirePermission); this is UX only.
    permissions: req.viewer.permissions || null,
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

app.patch('/api/org/custom-domain', requireOrg, requirePermission('workspace', 'edit'), async (req, res, next) => {
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
mountMarketplaceApi(app);
mountEventsApi(app);
routeContext = {
  storage, express, requireOrg, requireRole, requirePermission, requireSuperAdmin, auditFor,
  abTrackLimit, sanitizeContentHtml, sanitizeGlobalSettings,
};
registerCollectionRoutes(app, { requireOrg, requireRole, requirePermission, auditFor });
mountSocialApi(app);
mountEmailApi(app);

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

app.post('/api/pages', requireOrg, requirePermission('pages', 'edit'), async (req, res, next) => {
  try {
    const { pages, globalSettings: incomingGlobalSettings } = req.body;
    if (!pages || !Array.isArray(pages)) return res.status(400).json({ error: 'Invalid pages data structure' });
    if (pagesContainScriptBlock(pages) && req.viewer?.role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace admins can save a page containing a Script block.' });
    }
    if (pagesContainFullHtmlMode(pages) && req.viewer?.role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace admins can save a page in Full HTML mode.' });
    }
    // Optimistic concurrency. The client echoes back the `updatedAt` it
    // loaded for each page; if the stored row is newer, someone else saved
    // in the meantime and this write would silently overwrite them, so it's
    // refused with the list of pages that moved.
    const conflicts = req.body.force === true ? [] : await storage.pages.detectConflicts(req.org.id, pages);
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: conflicts.length === 1
          ? `"${conflicts[0].name}" was changed by someone else while you were editing.`
          : `${conflicts.length} pages were changed by someone else while you were editing.`,
        conflicts,
      });
    }
    const cleanPages = pages.map(sanitizePage);
    const oldPages = await storage.pages.list(req.org.id);
    await storage.versions.snapshot(req.org.id, oldPages, cleanPages);
    // Deletions are scoped to the pages this client actually had loaded, so
    // a page created in another tab since then is never collateral damage.
    const knownIds = Array.isArray(req.body.knownPageIds)
      ? req.body.knownPageIds.filter((id) => typeof id === 'string')
      : null;
    const written = await storage.pages.bulkReplace(req.org.id, cleanPages, { knownIds });
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

// Org-explicit page preview. The public site handler resolves which workspace
// to serve purely from the request HOST (orgIdForHost), so a workspace
// without a matching custom domain -- most of them, on the shared platform
// host -- couldn't be previewed there ("Open preview" opened the default
// org's site instead). This renders one specific page of one specific
// workspace by id, gated only by the signed preview token (which proves an
// authorized editor generated the link), so it works regardless of host.
app.get('/api/preview/:orgId/:pageId', async (req, res, next) => {
  try {
    if (!verifyPreviewToken(req.params.pageId, req.query.token)) {
      return res.status(403).send('This preview link is invalid or has expired. Reopen it from the editor.');
    }
    const orgId = req.params.orgId;
    const [pages, library, globalSettings] = await Promise.all([
      storage.pages.list(orgId),
      storage.library.list(orgId),
      storage.settings.get(orgId),
    ]);
    const stored = pages.find((p) => p.id === req.params.pageId);
    if (!stored) return res.status(404).send('Page not found.');
    // A preview is for checking work before it goes live, so it shows the
    // draft when there is one. The public route below deliberately does not.
    const page = editableView(stored);
    await hydrateEventBlocks(page, orgId, globalSettings?.timezone);
    await hydrateCollectionBlocks(page, orgId);
    hydrateLanguageBlocks(page, globalSettings, getFullPath(page, pages), '');
    const html = compilePageHtml(page, pages, library, globalSettings, {}, `https://${req.headers.host}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(html);
  } catch (e) { next(e); }
});

registerVersionRoutes(app, routeContext);
// ================= AI (paste-in block classification) =================

// Classifies one pasted HTML block for the page editor's "Paste in" import
// flow (see segment.js on the client). Only called for blocks the
// deterministic heuristics couldn't confidently label. Costs real money per
// call, so it's rate-limited on top of the normal editor role gate. Returns
// 501 (matches the deferred501 pattern below) when ANTHROPIC_API_KEY isn't
// configured -- the client falls back to importing the block as `unknown`.
app.post('/api/ai/classify-block', requireOrg, requirePermission('pages', 'edit'), aiClassifyLimit, async (req, res, next) => {
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

registerLibraryAuditRoutes(app, routeContext);
registerRedirectRoutes(app, routeContext);
registerCommentRoutes(app, routeContext);
registerAbRoutes(app, routeContext);
registerTeamRoutes(app, routeContext);
registerRoleRoutes(app, routeContext);
registerMediaRoutes(app, routeContext);
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

app.patch('/api/forms/:id', requireOrg, requirePermission('forms', 'edit'), async (req, res, next) => {
  try {
    await storage.forms.markRead(req.org.id, req.params.id, req.body?.read !== false);
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.delete('/api/forms/:id', requireOrg, requirePermission('forms', 'edit'), async (req, res, next) => {
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

app.patch('/api/feedback/:id', requireOrg, requirePermission('feedback', 'edit'), async (req, res, next) => {
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

// ================= PUBLIC PRODUCT CHECKOUT =================

// The Product block's Buy button is a plain link here -- no client JS, no
// cart. Creates a Stripe-hosted Checkout session for one product and 303s
// the visitor to it; fulfillment (order row, confirmation email) happens
// via the checkout.session.completed webhook in lib/commerce/routes.js.
const buyLimit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

app.get('/api/public/buy/:productId', buyLimit, async (req, res, next) => {
  try {
    const { stripe } = await import('./lib/commerce/stripeClient.js');
    if (!stripe) return res.status(503).send('Checkout is not available right now.');
    const productsRepo = await import('./lib/commerce/productsRepo.js');
    // A malformed id (products.id is a uuid column) makes the DB lookup
    // throw rather than return null -- either way, it's just "not found"
    // to the visitor, never a 500.
    const product = await productsRepo.getProduct(req.params.productId).catch(() => null);
    if (!product || product.price == null) return res.status(404).send('Product not found.');

    const quantity = Math.min(10, Math.max(1, Number(req.query.qty) || 1));
    const back = `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: Math.round(product.price * 100),
        },
        quantity,
      }],
      metadata: {
        commerce_item: JSON.stringify({ productId: product.id, variantId: null, quantity, name: product.name, price: product.price }),
        // Attribute the resulting order to the product's workspace (the
        // webhook reads this to set order.org_id).
        org_id: product.org_id || '',
      },
      success_url: `${back}/?purchased=1`,
      cancel_url: req.headers.referer || back,
    });
    res.redirect(303, session.url);
  } catch (e) { next(e); }
});

// ================= BUILT-IN ANALYTICS =================

// Beacon target for the tiny inline script compilePageHtml injects into
// every published page. Cookieless by design: nothing identifies the
// visitor, we just bump (org, day, path) -- no consent banner needed.
// sendBeacon posts text/plain, hence express.text + manual parse.
const pvLimit = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: false, legacyHeaders: false });

app.post('/api/public/pv', pvLimit, express.text({ type: '*/*', limit: '2kb' }), async (req, res) => {
  try {
    const orgId = await orgIdForHost(req.headers.host);
    if (!orgId) return res.status(204).end();
    let pagePath = '';
    try { pagePath = String(JSON.parse(req.body || '{}').p || '').slice(0, 300); } catch { /* malformed -> count as homepage */ }
    await storage.pageViews.record(orgId, pagePath.replace(/^\/+/, ''));
    res.status(204).end();
  } catch {
    res.status(204).end(); // analytics must never error a visitor's page
  }
});

app.get('/api/analytics/views', requireOrg, async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const rows = await storage.pageViews.list(req.org.id, days);
    const byDay = {};
    const byPath = {};
    let total = 0;
    for (const r of rows) {
      byDay[r.day] = (byDay[r.day] || 0) + r.views;
      byPath[r.path] = (byPath[r.path] || 0) + r.views;
      total += r.views;
    }
    const topPaths = Object.entries(byPath)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([path, views]) => ({ path: '/' + path, views }));
    res.json({ total, days, byDay, topPaths });
  } catch (e) { next(e); }
});

// ================= AI SITE GENERATION =================

// "Describe your business, get a themed multi-page site." Generated pages
// APPEND to the workspace (slug-deduped) so existing work is never
// overwritten; the generated theme only applies when the workspace had no
// pages yet (a fresh workspace gets the full effect, an established site
// keeps its look).
const aiGenerateLimit = rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false });

// Same generation, reported as it happens.
//
// The work takes twenty to forty seconds and used to be a silent spinner.
// This streams progress events read from the model's own output — never a
// timer — and finishes with the same payload the JSON route returns, so the
// two cannot drift in what they actually do.
//
// Errors are delivered as an `error` event rather than a status code: by the
// time anything can fail the 200 and the headers are long gone.
app.post('/api/ai/generate-site/stream', aiGenerateLimit, requireOrg, requirePermission('pages', 'edit'), async (req, res) => {
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx and some CDNs buffer a response until it closes, which would
    // hold every progress event until the very end and defeat the point.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  try {
    const { description } = req.body || {};
    if (!description?.trim() || description.trim().length < 10) {
      send('error', { error: 'Describe your business in a sentence or two first.' });
      return res.end();
    }
    const { pages: generated, theme } = await generateSite(
      description.trim(),
      (p) => send('progress', p),
    );

    send('progress', { phase: 'saving', message: 'Saving your pages…' });
    const existing = await storage.pages.list(req.org.id);
    const existingSlugs = new Set(existing.map((p) => p.slug));
    const deduped = generated.map((p) => {
      let slug = p.slug;
      while (existingSlugs.has(slug)) slug = `${p.slug}-${Math.floor(Math.random() * 1000)}`;
      existingSlugs.add(slug);
      return { ...p, slug };
    });

    await storage.pages.bulkReplace(req.org.id, [...existing, ...deduped.map(sanitizePage)]);
    if (existing.length === 0 && Object.keys(theme).length > 0) {
      const settings = await storage.settings.get(req.org.id);
      await storage.settings.replace(req.org.id, sanitizeGlobalSettings({ ...settings, theme: { ...settings.theme, ...theme } }));
    }
    await auditFor(req.org.id, req.viewer)('AI generated site', `${deduped.length} pages from a description`);
    send('done', {
      success: true,
      pages: deduped.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
      themeApplied: existing.length === 0,
    });
  } catch (e) {
    send('error', { error: e.message });
  }
  res.end();
});

app.post('/api/ai/generate-site', aiGenerateLimit, requireOrg, requirePermission('pages', 'edit'), async (req, res, next) => {
  try {
    const { description } = req.body || {};
    if (!description?.trim() || description.trim().length < 10) {
      return res.status(400).json({ error: 'Describe your business in a sentence or two first.' });
    }
    const { pages: generated, theme } = await generateSite(description.trim());

    const existing = await storage.pages.list(req.org.id);
    const existingSlugs = new Set(existing.map((p) => p.slug));
    const deduped = generated.map((p) => {
      let slug = p.slug;
      while (existingSlugs.has(slug)) slug = `${p.slug}-${Math.floor(Math.random() * 1000)}`;
      existingSlugs.add(slug);
      return { ...p, slug };
    });

    await storage.pages.bulkReplace(req.org.id, [...existing, ...deduped.map(sanitizePage)]);
    if (existing.length === 0 && Object.keys(theme).length > 0) {
      const settings = await storage.settings.get(req.org.id);
      await storage.settings.replace(req.org.id, sanitizeGlobalSettings({ ...settings, theme: { ...settings.theme, ...theme } }));
    }
    await auditFor(req.org.id, req.viewer)('AI generated site', `${deduped.length} pages from a description`);
    res.json({ success: true, pages: deduped.map((p) => ({ id: p.id, name: p.name, slug: p.slug })), themeApplied: existing.length === 0 });
  } catch (e) {
    // AI errors are user-actionable (retry, add detail) -- surface the
    // message rather than a generic 500.
    res.status(422).json({ error: e.message });
  }
});

// ================= PLATFORM BILLING (Nexus's own plans) =================

app.post('/api/billing/checkout', requireOrg, requirePermission('billing', 'edit'), async (req, res, next) => {
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

app.post('/api/billing/portal', requireOrg, requirePermission('billing', 'edit'), async (req, res, next) => {
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
  // The platform host (nexuscmshub.com) is a hybrid: some paths
  // are real published marketing pages (/, /pricing), but most top-level
  // paths are SPA app routes (/welcome, /admin, /super-admin, and every
  // /:orgSlug workspace). isPlatform tells the render handler to fall
  // back to the SPA shell for an unmatched path instead of redirecting to
  // "/" -- without it, self-serve signups at /:slug and /welcome never
  // load. Client custom domains are pure published sites and keep the
  // redirect-to-homepage behavior.
  isPlatform: true,
  orgId: null,
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
  orgId,
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
//     the bare nexuscmshub.com host until a client claims it.
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

// On-site search for the site being served. Public and unauthenticated, but
// scoped to one host's own published pages -- there's no way to ask it about
// another workspace. Rate-limited alongside the other public endpoints.
app.get('/api/public/search', formsLimit, async (req, res, next) => {
  try {
    const query = String(req.query.q || '').slice(0, 120);
    if (!query.trim()) return res.json({ results: [] });

    const site = await resolvePublicSite(req.headers.host);
    if (site.paused) return res.json({ results: [] });

    const [pages, globalSettings] = await Promise.all([site.loadPages(), site.loadSettings()]);
    const locales = localesOf(globalSettings);
    const requested = String(req.query.locale || '').trim();
    const locale = locales.find((l) => l.code === requested)?.code || locales[0].code;

    // Index the language being searched, so a Spanish query doesn't return
    // English pages.
    const index = buildSearchIndex(pages, {
      locale,
      localizedPageFor: (p) => localizedPage(p, locale, globalSettings),
      pathFor: (p) => localizedPath(getFullPath(p, pages), locale, globalSettings),
    });

    const results = searchIndex(index, query, { limit: 10 }).map((r) => ({
      path: r.path,
      title: highlight(r.title, query),
      excerpt: highlight(r.excerpt, query),
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.json({ results });
  } catch (e) { next(e); }
});

// Search-engine plumbing for every hosted site: sitemap lists published
// pages only (drafts stay invisible), robots points at it.
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const site = await resolvePublicSite(req.headers.host);
    if (site.paused) return res.status(404).end();
    const pages = await site.loadPages();
    const origin = `https://${req.headers.host}`;
    const settings = await site.loadSettings();
    const locales = localesOf(settings);
    const pageUrls = pages
      .filter((p) => p.status === 'published')
      .flatMap((p) => {
        const path = getFullPath(p, pages);
        // Every language is its own indexable URL; the hreflang tags in the
        // page head tie them together.
        return locales
          .filter((l) => l.code === locales[0].code || isMultilingual(settings))
          .map((l) => `  <url><loc>${origin}${localizedPath(path, l.code, settings)}</loc></url>`.replace(/\/<\/loc>/, '</loc>'));
      });

    // Collection detail pages are real, indexable URLs even though no `pages`
    // row exists for them -- without this the bulk of a content-heavy site
    // would be invisible to search engines.
    const entryUrls = [];
    if (site.orgId) {
      for (const collection of await collections.list(site.orgId)) {
        if (!collection.detailEnabled || !collection.detailBase || !collection.detailPageId) continue;
        for (const entry of await collections.listEntries(site.orgId, collection.id, { includeDrafts: false })) {
          entryUrls.push(`  <url><loc>${origin}/${collection.detailBase}/${entry.slug}</loc></url>`);
        }
      }
    }
    const urls = [...pageUrls, ...entryUrls].join('\n');
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

// ---- 3D model viewer (see lib/modelFrame.js for why it is isolated) ----
//
// Registered before the public catch-all: the catch-all treats any dotted or
// slashed path as a page to resolve, and these are neither pages nor API.

// The vendored Google <model-viewer> library, served same-origin so the
// frame's strict `script-src 'self'` accepts it. Read once, cached, immutable.
let _modelViewerJs;
app.get('/_nexus/model-viewer.js', (_req, res) => {
  if (_modelViewerJs === undefined) {
    try { _modelViewerJs = fs.readFileSync(path.join(__dirname, 'vendor', 'model-viewer.min.js'), 'utf8'); }
    catch { _modelViewerJs = null; }
  }
  if (!_modelViewerJs) return res.status(404).type('text/plain').send('3D viewer unavailable');
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(_modelViewerJs);
});

// The sandboxed frame. Its own CSP (not the page's) governs what runs inside.
app.get('/_nexus/model-frame', (req, res) => {
  const { ok, html } = renderModelFrame({
    src: req.query.src, poster: req.query.poster, ios: req.query.ios,
    alt: req.query.alt, bg: req.query.bg,
    rotate: req.query.rotate, interact: req.query.interact, ar: req.query.ar,
  });
  res.setHeader('Content-Security-Policy', modelFrameCsp());
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(ok ? 200 : 400).type('text/html; charset=utf-8').send(html);
});

app.use(async (req, res, next) => {
  try {
    // HEAD included: uptime monitors and some crawlers probe with HEAD,
    // and Express automatically omits the body for them -- only handling
    // GET made every public page 404 to those probes.
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const requestPath = req.path.split('/').filter(Boolean).join('/');
    if (requestPath.startsWith('api') || requestPath.includes('.')) return next();

    // Dedicated Super Admin host (admin.nexuscmshub.com): it is the portal, not
    // a public site. The platform host would otherwise serve Nexus's marketing
    // page at "/", so the SPA never boots there and the client-side redirect
    // can't run. Redirect the root to the portal and serve the SPA shell for
    // every other path so client routing takes over. (/super-admin/* is served
    // straight from index.html by vercel.json and never reaches here.) The
    // serverless function sees VITE_ADMIN_HOST too — the prefix only controls
    // client inlining, not availability to the function.
    const adminHost = process.env.ADMIN_HOST || process.env.VITE_ADMIN_HOST;
    if (adminHost && req.headers.host === adminHost) {
      if (requestPath === '') return res.redirect(302, '/super-admin');
      const shell = spaShell();
      if (shell) return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(shell);
    }

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

    // A declared non-default locale owns a leading path segment (/es/about).
    // Only codes the workspace actually declared are recognised, so a page
    // whose slug happens to be "no" or "it" keeps working.
    const { locale, path: localePath } = splitLocalePath(requestPath, globalSettings);

    let page = localePath === ''
      ? (pages.find(p => p.slug === 'index') || pages[0])
      : pages.find(p => getFullPath(p, pages) === localePath);

    // A collection with detail pages turned on owns `<base>/<entry-slug>`.
    // Checked only when no real page claims the path, so an author who
    // creates a page at the same URL still wins -- least surprising, and it
    // means turning detail pages on can never shadow existing content.
    let detail = null;
    if (!page && site.orgId) {
      detail = await resolveCollectionDetail(localePath, site.orgId, pages);
      if (detail) page = buildDetailPage(detail.templatePage, detail.collection, detail.entry);
    }

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

    // Lay the locale's translation over the page before anything renders, so
    // hydration and compilation both see the translated blocks.
    page = localizedPage(page, locale, globalSettings);

    // Hydrate any calendar-bound event blocks with live events before compile.
    if (site.orgId) await hydrateEventBlocks(page, site.orgId, globalSettings?.timezone);
    // …and any collection-bound list blocks with their live entries.
    if (site.orgId) await hydrateCollectionBlocks(page, site.orgId);
    hydrateLanguageBlocks(page, globalSettings, getFullPath(page, pages), locale);

    let renderedHtml = compilePageHtml(page, pages, library, globalSettings, abChoices, `https://${req.headers.host}`, locale);
    // Social Feed blocks are placeholders until here: swap each for real,
    // escaped post HTML built from the workspace's connected account. No-op
    // (and cheap) when the page has no feed block. Runs before the CSP hash
    // pass since it may add a <style> block (never a <script>).
    if (site.orgId) renderedHtml = await injectSocialFeeds(renderedHtml, site.orgId);

    // Give every image we host a srcset, so a phone stops downloading a
    // 3000px file into a 390px column. Runs on the finished HTML rather than
    // in the renderers because card items, listing photos and imported
    // full-HTML pages carry bare URL strings that no renderer helper reaches.
    // Additive only: an <img> that already declares srcset is left alone.
    if (site.orgId) {
      try {
        renderedHtml = applyResponsiveImages(renderedHtml, await mediaIndexFor(site.orgId));
      } catch { /* a missing srcset is not worth failing a page render over */ }
    }
    const analyticsHosts = process.env.ANALYTICS_HOSTS || '';

    // Full HTML mode is the trusted-author escape hatch: it already bypasses
    // sanitization, theme, and header/footer injection ("full document
    // control", requires a workspace admin to save). Those pages are often
    // hand-authored against runtime tools like the Tailwind Play CDN
    // (needs 'unsafe-eval' for its in-browser JIT) and call third-party APIs,
    // which the strict block-page CSP deliberately forbids. So we serve a
    // looser policy for editorMode==='full-html' ONLY -- every normal
    // block-based published page keeps the strict, hash-pinned CSP below.
    const isFullHtml = page.editorMode === 'full-html';
    res.setHeader('Content-Security-Policy', (isFullHtml ? [
      `default-src 'self'`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https: ${analyticsHosts}`.trim(),
      `style-src 'self' 'unsafe-inline' https:`,
      `img-src 'self' data: https:`,
      `media-src 'self' data: blob: https:`,
      `font-src 'self' data: https:`,
      `connect-src 'self' https: ${analyticsHosts}`.trim(),
      `frame-src https:`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self' https:`,
    ] : [
      `default-src 'self'`,
      // Inline hashes: Script blocks + inline analytics snippets would be
      // silently blocked by 'self' alone. Hashed per-response, stays strict.
      `script-src 'self' ${analyticsHosts} ${inlineScriptHashes(renderedHtml)}`.trim(),
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `img-src 'self' data: https:`,
      // Video/Background Video blocks: <video> sources from same-origin,
      // any https CDN, or inline data/blob. Without this, default-src 'self'
      // blocks external mp4s (same class of allowance as img-src above).
      `media-src 'self' data: blob: https:`,
      `font-src 'self' data: https://fonts.gstatic.com`,
      `connect-src 'self' ${analyticsHosts}`,
      // Video Embed block: default-src 'self' was blocking YouTube/Vimeo
      // iframes entirely in production.
      `frame-src 'self' https://www.youtube.com https://player.vimeo.com ${tourFrameSrc()}`.trim(),
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ]).join('; '));
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

// A table that doesn't exist is not a server fault, it's a deploy that got
// ahead of its migrations — and it has a specific, one-command fix. Returning
// a bare "Internal server error" for it sent people hunting through logs for
// something the message could have just said. Postgres reports it as 42P01;
// PostgREST passes the text through, so matching on either is enough.
const MISSING_TABLE = /relation "[^"]*" does not exist|\b42P01\b/i;
const MISSING_COLUMN = /column [^ ]* does not exist|\b42703\b/i;

app.use((err, req, res, _next) => {
  console.error('[unhandled]', err.message);

  if (MISSING_TABLE.test(err.message || '')) {
    const table = /relation "(?:public\.)?([^"]+)"/i.exec(err.message)?.[1];
    return res.status(503).json({
      error: table
        ? `This feature needs a database table ("${table}") that hasn't been created yet. Run the pending migrations: npm run migrate`
        : "This feature needs a database migration that hasn't been applied yet. Run: npm run migrate",
    });
  }

  // A missing COLUMN (42703) is the same class of problem as a missing table
  // -- code deployed ahead of its migration -- but reports differently, so it
  // used to fall through to a bare 500 with no hint of the real fix.
  if (MISSING_COLUMN.test(err.message || '')) {
    const col = /column "?([\w.]+)"? does not exist/i.exec(err.message)?.[1];
    return res.status(503).json({
      error: col
        ? `This feature needs a database column ("${col}") that a migration hasn't added yet. Run: npm run migrate`
        : "This feature needs a database migration that hasn't been applied yet. Run: npm run migrate",
    });
  }

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
