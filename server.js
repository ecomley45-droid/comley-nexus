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
import { fileURLToPath } from 'url';
import { compilePageHtml, getFullPath, pickWeightedVariant } from './src/shared/compilePage.js';
import { mountCommerceWebhooks, mountCommerceApi } from './lib/commerce/routes.js';
import { mountOpsApi } from './lib/ops/routes.js';
import { mountNexusApi } from './lib/nexusRoutes.js';
import {
  attachClerk, resolveViewer, requireRole, requireOrgMatch, requireSuperAdmin,
  isSuperAdminViewer, assertProductionAuth,
} from './lib/auth.js';
import { sanitizePage, sanitizeGlobalSettings, sanitizeContentHtml } from './lib/sanitize.js';
import * as storage from './lib/storage.js';
import * as nexus from './lib/nexus.js';
import { classifyBlock, hasAnthropicKey } from './lib/ai.js';

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
// actionable message.
const requireOrg = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!req.org) return res.status(403).json({ error: 'No workspace on this account' });
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
    } : null,
  });
});

// ================= COMMERCE + OPS =================

mountCommerceApi(app);
mountOpsApi(app);
mountNexusApi(app);

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
    const entry = await storage.team.add(req.org.id, {
      id: 'team-' + Date.now(), name: name.trim(), email: email.trim(), role,
    });
    await auditFor(req.org.id, req.viewer)('Added team member', `${entry.name} <${entry.email}> as ${entry.role}`);
    res.json({ success: true, entry });
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
    const { id, name, domain, plan, featureFlags, adminEmail } = req.body || {};
    if (!id?.trim() || !name?.trim()) return res.status(400).json({ error: 'id and name are required' });
    const slug = String(id).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await storage.orgs.get(slug);
    if (existing) return res.status(400).json({ error: `An org with slug "${slug}" already exists.` });
    const org = await storage.orgs.create({ id: slug, name: name.trim(), domain, plan, featureFlags });
    if (adminEmail?.trim()) {
      await storage.orgMembers.add(slug, adminEmail.trim().toLowerCase(), 'admin');
    }
    // Seed a default page + audit entry so the org isn't stark empty on first login.
    await storage.audit.append(slug, 'Workspace created', `Created by ${req.viewer?.email || 'unknown'}`);
    res.json({ success: true, org });
  } catch (e) { next(e); }
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

app.delete('/api/orgs/:id/members/:email', requireSuperAdmin, async (req, res, next) => {
  try {
    await storage.orgMembers.remove(req.params.id, req.params.email);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ================= DEFERRED SURFACES (501) =================

const deferred501 = (msg) => (_req, res) => res.status(501).json({ error: msg });
app.get('/api/media', deferred501('Media library is being migrated to Supabase Storage - coming soon.'));
app.post('/api/media', deferred501('Media upload is being migrated to Supabase Storage - coming soon.'));
app.delete('/api/media/:id', deferred501('Media library is being migrated to Supabase Storage - coming soon.'));
app.get('/api/export/csv/:type', deferred501('CSV export is temporarily disabled during the storage migration.'));
app.get('/api/export/csv/:type/template', deferred501('CSV export is temporarily disabled during the storage migration.'));
app.post('/api/import/csv/:type', deferred501('CSV import is temporarily disabled during the storage migration.'));
app.post('/api/export', deferred501('Static site export is temporarily disabled during the storage migration.'));

// ================= DYNAMIC PAGE RENDER =================

const nexusSite = () => ({
  findRedirect: (p) => nexus.redirects.findMatch(p),
  applySchedules: () => nexus.pages.applyScheduledPublishes(),
  loadPages: () => nexus.pages.list(),
  loadLibrary: () => nexus.library.list(),
  loadSettings: () => nexus.settings.get(),
  recordImpression: async () => {}, // no A/B wiring for Nexus's own site in v1
});

const orgSite = (orgId) => ({
  findRedirect: (p) => storage.redirects.findMatch(orgId, p),
  applySchedules: () => applyDueSchedules(orgId),
  loadPages: () => storage.pages.list(orgId),
  loadLibrary: () => storage.library.list(orgId),
  loadSettings: () => storage.settings.get(orgId),
  recordImpression: (sectionId, variantId) => storage.abStats.record(orgId, sectionId, variantId, 'impressions'),
});

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
  if (matched) return orgSite(matched.id);

  const explicitDefault = process.env.DEFAULT_PUBLIC_ORG_ID || process.env.PUBLIC_ORG_ID;
  if (explicitDefault) return orgSite(explicitDefault);

  return nexusSite();
}

app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET') return next();
    const requestPath = req.path.split('/').filter(Boolean).join('/');
    if (requestPath.startsWith('api') || requestPath.includes('.')) return next();

    const site = await resolvePublicSite(req.headers.host);

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

    if (!page) return res.redirect(302, '/');
    const isPreview = req.query.preview === '1' || req.query.preview === 'true';
    if (page.status !== 'published' && !isPreview) return res.redirect(302, '/');

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

    const renderedHtml = compilePageHtml(page, pages, library, globalSettings, abChoices);
    const analyticsHosts = process.env.ANALYTICS_HOSTS || '';
    res.setHeader('Content-Security-Policy', [
      `default-src 'self'`,
      `script-src 'self' ${analyticsHosts}`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: https:`,
      `font-src 'self' data:`,
      `connect-src 'self' ${analyticsHosts}`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
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
