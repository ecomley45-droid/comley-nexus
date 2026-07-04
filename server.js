// Sentry is initialized via `node --import ./instrument.mjs server.js`
// (see package.json scripts). That runs BEFORE the ESM module graph is
// resolved, so http/express get patched correctly. Do NOT `import
// ./instrument.mjs` here — ESM hoisting would defeat the ordering.
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
import { attachClerk, resolveViewer, requireRole, assertProductionAuth } from './lib/auth.js';
import { sanitizePage, sanitizeGlobalSettings, sanitizeContentHtml } from './lib/sanitize.js';
import * as storage from './lib/storage.js';

assertProductionAuth();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Stripe webhook signature verification needs the raw body, so it must be
// mounted before the global express.json() parser below.
mountCommerceWebhooks(app);

// Baseline body parser is small; per-route parsers override for /api/media
// and /api/feedback which legitimately accept base64 images.
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Trust one hop of proxy (Vercel/Cloudflare) so rate-limit keys off real IP.
app.set('trust proxy', 1);

// Helmet: sensible security headers on ALL responses. CSP for the rendered-
// page middleware is set inline where those responses are built.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS: allowlist driven by env. Empty allowlist = same-origin only.
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

// Coarse global rate limit — blunts scraping/enumeration on /api.
app.use('/api', rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Real auth: attach Clerk (no-op if unconfigured for dev) and resolve
// req.viewer for every route.
attachClerk(app);
app.use(resolveViewer);

// Per-route parsers for endpoints that legitimately accept base64 payloads.
// Feedback still allows small screenshots; media upload is disabled in this
// slice (not part of the MVP go-live surface — see below).
const feedbackJson = express.json({ limit: '4mb' });

// Rate limits for unauth'd write paths.
const feedbackLimit = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
const abTrackLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

// ================= HELPERS =================

const audit = (action, details, actor = null) =>
  storage.audit.append(action, details, actor).catch((e) => {
    // Best-effort — never break the request on audit-log failure.
    console.error('[audit]', e.message);
  });

// Applied on every read so drafts whose scheduled time has passed auto-flip
// to 'published'. Cheap: single UPDATE query, no roundtrip for normal reads
// when nothing is due.
const applyDueSchedules = async () => {
  try {
    const flipped = await storage.pages.applyScheduledPublishes();
    if (flipped > 0) await audit('Scheduled publish', `${flipped} page(s) auto-published on schedule`);
  } catch (e) {
    console.error('[schedule]', e.message);
  }
};

// ================= API ROUTES =================

// Health check for Fly.io — no auth, no DB, just proof the process is up.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// Commerce API (products, cart, checkout, orders, search)
mountCommerceApi(app);

// Ops API (feedback assignees/comments, systems, prefs, dashboard, git-pulls)
mountOpsApi(app);

// ----- Pages -----
app.get('/api/pages', async (req, res, next) => {
  try {
    await applyDueSchedules();
    const [pages, globalSettings] = await Promise.all([storage.pages.list(), storage.settings.get()]);
    res.json({ pages, globalSettings });
  } catch (e) { next(e); }
});

app.post('/api/pages', requireRole('editor'), async (req, res, next) => {
  try {
    const { pages, globalSettings: incomingGlobalSettings } = req.body;
    if (!pages || !Array.isArray(pages)) return res.status(400).json({ error: 'Invalid pages data structure' });

    // Sanitize every page's HTML fields before persist. Persistent XSS is
    // the highest-impact risk on a builder like this.
    const cleanPages = pages.map(sanitizePage);
    const oldPages = await storage.pages.list();

    // Snapshot the OLD state of any page that changed, so restore = revert.
    await storage.versions.snapshot(oldPages, cleanPages);

    const written = await storage.pages.bulkReplace(cleanPages);

    let updatedGlobals = null;
    if (incomingGlobalSettings && req.viewer?.role === 'admin') {
      updatedGlobals = await storage.settings.replace(sanitizeGlobalSettings(incomingGlobalSettings));
    } else {
      updatedGlobals = await storage.settings.get();
    }

    const createdCount = cleanPages.filter(p => !oldPages.find(o => o.id === p.id)).length;
    const deletedCount = oldPages.filter(o => !cleanPages.find(p => p.id === o.id)).length;
    const changedCount = cleanPages.length - createdCount;

    if (createdCount || deletedCount || changedCount) {
      const parts = [];
      if (createdCount) parts.push(`${createdCount} created`);
      if (changedCount) parts.push(`${changedCount} updated`);
      if (deletedCount) parts.push(`${deletedCount} deleted`);
      await audit('Saved pages', parts.join(', '), req.viewer?.email);
    }

    res.json({ success: true, pages: written, globalSettings: updatedGlobals });
  } catch (e) { next(e); }
});

// ----- Page versions -----
app.get('/api/versions/:pageId', async (req, res, next) => {
  try { res.json(await storage.versions.listForPage(req.params.pageId)); } catch (e) { next(e); }
});

app.post('/api/versions/:pageId/:versionId/restore', requireRole('editor'), async (req, res, next) => {
  try {
    const version = await storage.versions.get(req.params.pageId, req.params.versionId);
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const pages = await storage.pages.list();
    const targetIndex = pages.findIndex(p => p.id === req.params.pageId);
    if (targetIndex === -1) return res.status(404).json({ error: 'Page no longer exists' });

    // Snapshot current state before overwriting, so restoring is itself undoable
    const next = pages.map((p, i) => i === targetIndex ? version.snapshot : p);
    await storage.versions.snapshot(pages, next);
    const written = await storage.pages.bulkReplace(next);
    await audit('Restored version', `Page "${version.snapshot.name}" restored to version from ${new Date(version.timestamp).toLocaleString()}`, req.viewer?.email);

    res.json({ success: true, pages: written });
  } catch (e) { next(e); }
});

// ----- Audit log -----
app.get('/api/audit', async (req, res, next) => {
  try { res.json(await storage.audit.list()); } catch (e) { next(e); }
});

// ----- Library -----
app.get('/api/library', async (req, res, next) => {
  try { res.json(await storage.library.list()); } catch (e) { next(e); }
});

app.post('/api/library', requireRole('editor'), async (req, res, next) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'Invalid library data structure' });
    const clean = entries.map(e => ({ ...e, html: sanitizeContentHtml(e?.html || '') }));
    const written = await storage.library.bulkReplace(clean);
    res.json({ success: true, library: written });
  } catch (e) { next(e); }
});

// ----- Redirects -----
app.get('/api/redirects', async (req, res, next) => {
  try { res.json(await storage.redirects.list()); } catch (e) { next(e); }
});

app.post('/api/redirects', requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to, type } = req.body;
    const cleanFrom = String(from ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const cleanTo = (to || '').trim();
    if (!cleanFrom || !cleanTo) return res.status(400).json({ error: 'from and to are required' });
    const existing = await storage.redirects.getByFrom(cleanFrom);
    if (existing) return res.status(400).json({ error: `A redirect from "/${cleanFrom}" already exists.` });
    const entry = {
      id: 'redir-' + Date.now(), from: cleanFrom, to: cleanTo,
      type: Number(type) === 301 ? 301 : 302,
    };
    await storage.redirects.add(entry);
    await audit('Added redirect', `/${cleanFrom} → ${cleanTo}`, req.viewer?.email);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.delete('/api/redirects/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const removed = await storage.redirects.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Redirect not found' });
    await audit('Deleted redirect', `/${removed.from} → ${removed.to}`, req.viewer?.email);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ----- Inline section comments -----
app.get('/api/comments', async (req, res, next) => {
  try { res.json(await storage.comments.list(req.query.pageId)); } catch (e) { next(e); }
});

app.post('/api/comments', requireRole('editor'), async (req, res, next) => {
  try {
    const { pageId, sectionId, text, author } = req.body;
    if (!pageId || !sectionId || !text?.trim()) return res.status(400).json({ error: 'pageId, sectionId, and text are required' });
    const entry = await storage.comments.add({
      id: 'comment-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      pageId, sectionId, text: text.trim(),
      author: author || req.viewer?.email || 'anonymous',
    });
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.patch('/api/comments/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const entry = await storage.comments.setResolved(req.params.id, !!req.body.resolved);
    if (!entry) return res.status(404).json({ error: 'Comment not found' });
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.delete('/api/comments/:id', requireRole('editor'), async (req, res, next) => {
  try { await storage.comments.remove(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ----- A/B testing -----
app.post('/api/ab-track', abTrackLimit, async (req, res, next) => {
  try {
    const { sectionId, variantId, event } = req.body;
    if (!sectionId || !variantId || event !== 'click') {
      return res.status(400).json({ error: 'sectionId, variantId, and event="click" are required' });
    }
    await storage.abStats.record(sectionId, variantId, 'clicks');
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.get('/api/ab-stats/:sectionId', async (req, res, next) => {
  try { res.json(await storage.abStats.forSection(req.params.sectionId)); } catch (e) { next(e); }
});

// ----- Team roster -----
app.get('/api/team', async (req, res, next) => {
  try { res.json(await storage.team.list()); } catch (e) { next(e); }
});

app.post('/api/team', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, email, role } = req.body;
    if (!name?.trim() || !email?.trim() || !['viewer', 'editor', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'name, email, and a valid role are required' });
    }
    const entry = await storage.team.add({
      id: 'team-' + Date.now(), name: name.trim(), email: email.trim(), role,
    });
    await audit('Added team member', `${entry.name} <${entry.email}> as ${entry.role}`, req.viewer?.email);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.delete('/api/team/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const removed = await storage.team.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Team member not found' });
    await audit('Removed team member', `${removed.name} <${removed.email}>`, req.viewer?.email);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ----- Feedback tickets -----
app.get('/api/feedback', async (req, res, next) => {
  try { res.json(await storage.feedback.list()); } catch (e) { next(e); }
});

app.post('/api/feedback', feedbackLimit, feedbackJson, async (req, res, next) => {
  try {
    const { type, description, expectedBehavior, currentBehavior, urgent, area, path: reportPath } = req.body;
    const VALID_TYPES = ['bug', 'non_functioning', 'critical', 'feature_request'];
    if (!VALID_TYPES.includes(type) || !description?.trim()) {
      return res.status(400).json({ error: 'A valid type and a description are required' });
    }
    // Screenshot/image uploads are deferred until we migrate media to
    // Supabase Storage — for now, tickets are text-only when running on
    // serverless (no disk to save the file to).
    const entry = await storage.feedback.add({
      id: 'feedback-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      type, description: description.trim(),
      expectedBehavior: expectedBehavior || '', currentBehavior: currentBehavior || '',
      urgent: !!urgent, area: area === 'commerce' ? 'commerce' : 'cms', path: reportPath || '',
      reportedRole: req.viewer?.role || 'anonymous', reportedBy: req.viewer?.email || null,
      screenshotUrl: null, imageUrls: [],
    });
    await audit('Feedback submitted', `${type}${urgent ? ' (urgent)' : ''} on ${entry.path}`, req.viewer?.email);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

app.patch('/api/feedback/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const VALID_STATUSES = ['open', 'acknowledged', 'in_progress', 'sent_to_agent', 'resolved', 'closed'];
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const entry = await storage.feedback.updateStatus(req.params.id, status);
    if (!entry) return res.status(404).json({ error: 'Feedback ticket not found' });
    await audit('Feedback status changed', `${entry.type} ticket -> ${status}`, req.viewer?.email);
    res.json({ success: true, entry });
  } catch (e) { next(e); }
});

// ----- Media, CSV import/export, static site export -----
// These are deferred out of the first-live slice. Media upload requires
// Supabase Storage wiring (bucket + presigned URLs). CSV import/export can
// be added once storage helpers grow list/upsert-by-id per collection.
// For now, calls to these endpoints return a friendly 501 so the UI shows
// an actionable message instead of hanging.
const deferred501 = (msg) => (_req, res) => res.status(501).json({ error: msg });
app.get('/api/media', deferred501('Media library is being migrated to Supabase Storage — coming soon.'));
app.post('/api/media', deferred501('Media upload is being migrated to Supabase Storage — coming soon.'));
app.delete('/api/media/:id', deferred501('Media library is being migrated to Supabase Storage — coming soon.'));
app.get('/api/export/csv/:type', deferred501('CSV export is temporarily disabled during the storage migration.'));
app.get('/api/export/csv/:type/template', deferred501('CSV export is temporarily disabled during the storage migration.'));
app.post('/api/import/csv/:type', deferred501('CSV import is temporarily disabled during the storage migration.'));
app.post('/api/export', deferred501('Static site export is temporarily disabled during the storage migration.'));

// ================= DYNAMIC ROUTING =================
// Serves compiled pages at any non-/api, non-static path. Same shape as
// before, backed by Supabase now.
app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET') return next();
    const requestPath = req.path.split('/').filter(Boolean).join('/');
    if (requestPath.startsWith('api') || requestPath.includes('.')) return next();

    const redirect = await storage.redirects.findMatch(requestPath);
    if (redirect) {
      const isAbsoluteOrRooted = /^https?:\/\//i.test(redirect.to) || redirect.to.startsWith('/');
      return res.redirect(redirect.type || 302, isAbsoluteOrRooted ? redirect.to : '/' + redirect.to);
    }

    await applyDueSchedules();
    const [pages, library, globalSettings] = await Promise.all([
      storage.pages.list(), storage.library.list(), storage.settings.get(),
    ]);

    const page = requestPath === ''
      ? (pages.find(p => p.slug === 'index') || pages[0])
      : pages.find(p => getFullPath(p, pages) === requestPath);

    if (!page) return next();

    const isPreview = req.query.preview === '1' || req.query.preview === 'true';
    if (page.status !== 'published' && !isPreview) return next();

    // Per-visitor A/B choices (impressions recorded in DB).
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
      await storage.abStats.record(section.id, variant.id, 'impressions');
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

// Sentry's Express error handler must sit AFTER all routes but BEFORE any
// other error-handling middleware. It reports the error then delegates to
// Express's default handler.
Sentry.setupExpressErrorHandler(app);

// Default JSON error responder so nothing leaks stack traces to clients.
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Export the app for the serverless wrapper (api/index.js). When run
// directly, also listen on PORT. The wrapper sets SERVERLESS=1 to opt out
// of the listen call.
export default app;

// VERCEL / AWS_LAMBDA_FUNCTION_NAME are set automatically in those runtimes.
// SERVERLESS is the manual override for other serverless hosts.
const inServerless = process.env.SERVERLESS || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
if (!inServerless) {
  app.listen(PORT, () => {
    console.log(`CMS Backend running on port ${PORT}`);
    console.log(`- API endpoints starting with: http://localhost:${PORT}/api`);
    console.log(`- Live pages available at: http://localhost:${PORT}/{slug}`);
  });
}
