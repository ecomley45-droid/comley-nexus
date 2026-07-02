import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compilePageHtml, getFullPath, pickWeightedVariant } from './src/shared/compilePage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '15mb' }));

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-User-Role');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Lightweight role gate: this app has no login/session system, so this is a
// trust-based simulation (the client picks its own role) rather than real
// security — useful for keeping casual collaborators on a shared local
// instance from accidentally nuking settings, not for protecting secrets.
const ROLE_RANK = { viewer: 0, editor: 1, admin: 2 };
app.use((req, res, next) => {
  req.userRole = req.header('X-User-Role') || 'admin';
  next();
});
const requireRole = (minRole) => (req, res, next) => {
  if ((ROLE_RANK[req.userRole] ?? 0) < ROLE_RANK[minRole]) {
    return res.status(403).json({ error: `This action requires the "${minRole}" role (you are "${req.userRole}").` });
  }
  next();
};

// Paths to database files
const PAGES_FILE = path.join(__dirname, 'data', 'pages.json');
const LIBRARY_FILE = path.join(__dirname, 'data', 'library.json');
const VERSIONS_FILE = path.join(__dirname, 'data', 'versions.json');
const AUDIT_FILE = path.join(__dirname, 'data', 'audit.json');
const MEDIA_FILE = path.join(__dirname, 'data', 'media.json');
const MEDIA_DIR = path.join(__dirname, 'data', 'media-files');
const REDIRECTS_FILE = path.join(__dirname, 'data', 'redirects.json');
const COMMENTS_FILE = path.join(__dirname, 'data', 'comments.json');
const AB_STATS_FILE = path.join(__dirname, 'data', 'ab-stats.json');
const DIST_SITE_DIR = path.join(__dirname, 'dist_site');

app.use('/media', express.static(MEDIA_DIR));

const MAX_VERSIONS_PER_PAGE = 20;
const MAX_AUDIT_ENTRIES = 500;

// Global Settings (In-memory, but could be saved to a file)
let globalSettings = {
  siteName: 'Enterprise Sandbox Web',
  theme: {
    primary: '#6366f1',
    secondary: '#d946ef',
    bg: '#070a13',
    text: '#e2e8f0'
  },
  analytics: { headSnippet: '', bodySnippet: '' }
};

// Helper to read JSON safely
const readJsonFile = (filePath, defaultVal = []) => {
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2));
      return defaultVal;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return defaultVal;
  }
};

// Helper to write JSON safely
const writeJsonFile = (filePath, data) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
};

// Normalize a page read from disk into the current schema: legacy string
// `content` is auto-wrapped into a single section, and new fields default in.
// Applied on every read (not a one-time disk rewrite) so nothing touches disk
// until the user explicitly saves.
const normalizePage = (page) => {
  let content = page.content;
  if (typeof content === 'string') {
    content = [{ id: 'sec-legacy-' + (page.id || 'x'), name: 'Section 1', html: content }];
  } else if (!Array.isArray(content)) {
    content = [];
  }
  return {
    ...page,
    content,
    parentId: page.parentId ?? null,
    seo: page.seo ?? { title: '', description: '', ogImage: '' },
    // Pages already on disk before this feature existed are treated as already
    // published, so existing live sites don't disappear; only newly created
    // pages default to 'draft'.
    status: page.status ?? 'published',
    scheduledPublishAt: page.scheduledPublishAt ?? null,
    analytics: page.analytics ?? { headSnippet: '', bodySnippet: '' }
  };
};

// Flip any draft page whose scheduled time has passed to published. There's
// no real cron here — this runs lazily on every page read (plus a periodic
// timer below) so scheduling works without adding a job-queue dependency.
const applyScheduledPublishes = (pages) => {
  let changed = 0;
  const updated = pages.map(p => {
    if (p.status === 'draft' && p.scheduledPublishAt && p.scheduledPublishAt <= Date.now()) {
      changed++;
      return { ...p, status: 'published', scheduledPublishAt: null };
    }
    return p;
  });
  return { changed, pages: updated };
};

const readPagesFile = () => {
  const pages = readJsonFile(PAGES_FILE).map(normalizePage);
  const { changed, pages: updated } = applyScheduledPublishes(pages);
  if (changed > 0) {
    writeJsonFile(PAGES_FILE, updated);
    appendAudit('Scheduled publish', `${changed} page(s) auto-published on schedule`);
  }
  return updated;
};

// ----- A/B testing -----
const parseCookies = (req) => {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return acc;
    acc[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    return acc;
  }, {});
};

const recordAbEvent = (sectionId, variantId, field) => {
  const stats = readJsonFile(AB_STATS_FILE, {});
  stats[sectionId] = stats[sectionId] || {};
  stats[sectionId][variantId] = stats[sectionId][variantId] || { impressions: 0, clicks: 0 };
  stats[sectionId][variantId][field]++;
  writeJsonFile(AB_STATS_FILE, stats);
};

// Decide (and stick, via cookie) which variant each A/B-tested section on this
// page shows for this visitor, recording an impression for whichever is shown.
const resolveAbChoicesForRequest = (page, req, res) => {
  const cookies = parseCookies(req);
  const choices = {};
  (page.content || []).forEach(section => {
    if (!Array.isArray(section.abVariants) || section.abVariants.length === 0) return;
    const cookieKey = `ab_${section.id}`;
    const existing = section.abVariants.find(v => v.id === cookies[cookieKey]);
    const variant = existing || pickWeightedVariant(section.abVariants);
    choices[section.id] = variant.id;
    if (!existing) {
      res.cookie(cookieKey, variant.id, { maxAge: 30 * 24 * 60 * 60 * 1000 });
    }
    recordAbEvent(section.id, variant.id, 'impressions');
  });
  return choices;
};

// ----- Audit log -----
const appendAudit = (action, details) => {
  const audit = readJsonFile(AUDIT_FILE);
  audit.unshift({ id: 'audit-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), timestamp: Date.now(), action, details });
  writeJsonFile(AUDIT_FILE, audit.slice(0, MAX_AUDIT_ENTRIES));
};

// ----- Version history -----
// Snapshots are taken of the OLD state of any page that changed in a save,
// so "restore" means "go back to how it was before this save."
const snapshotChangedPages = (oldPages, newPages) => {
  const versions = readJsonFile(VERSIONS_FILE);
  let changedCount = 0;
  newPages.forEach(newPage => {
    const oldPage = oldPages.find(p => p.id === newPage.id);
    if (!oldPage) return; // newly created page, nothing to snapshot
    if (JSON.stringify(oldPage) === JSON.stringify(newPage)) return; // unchanged
    changedCount++;
    versions.unshift({
      id: 'ver-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      pageId: newPage.id,
      timestamp: Date.now(),
      snapshot: oldPage
    });
  });
  if (changedCount > 0) {
    // Cap retained versions per page so this file doesn't grow unbounded
    const byPage = {};
    versions.forEach(v => {
      byPage[v.pageId] = byPage[v.pageId] || [];
      byPage[v.pageId].push(v);
    });
    const trimmed = Object.values(byPage).flatMap(list =>
      list.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_VERSIONS_PER_PAGE)
    );
    writeJsonFile(VERSIONS_FILE, trimmed);
  }
  return changedCount;
};

// ================= API ROUTES =================

// 1. Pages API
app.get('/api/pages', (req, res) => {
  const pages = readPagesFile();
  res.json({ pages, globalSettings });
});

app.post('/api/pages', requireRole('editor'), (req, res) => {
  const { pages, globalSettings: incomingGlobalSettings } = req.body;
  if (!pages || !Array.isArray(pages)) {
    return res.status(400).json({ error: 'Invalid pages data structure' });
  }

  const oldPages = readPagesFile();
  const oldIds = new Set(oldPages.map(p => p.id));
  const newIds = new Set(pages.map(p => p.id));
  const createdCount = pages.filter(p => !oldIds.has(p.id)).length;
  const deletedCount = oldPages.filter(p => !newIds.has(p.id)).length;
  const changedCount = snapshotChangedPages(oldPages, pages);

  writeJsonFile(PAGES_FILE, pages);
  // Global theme/site settings are admin-only — editors can still save page
  // content/structure in the same request, but their settings changes are dropped.
  if (incomingGlobalSettings && req.userRole === 'admin') {
    globalSettings = incomingGlobalSettings;
  }

  if (createdCount || deletedCount || changedCount) {
    const parts = [];
    if (createdCount) parts.push(`${createdCount} created`);
    if (changedCount) parts.push(`${changedCount} updated`);
    if (deletedCount) parts.push(`${deletedCount} deleted`);
    appendAudit('Saved pages', parts.join(', '));
  }

  res.json({ success: true, pages, globalSettings });
});

// 1b. Version history API
app.get('/api/versions/:pageId', (req, res) => {
  const versions = readJsonFile(VERSIONS_FILE)
    .filter(v => v.pageId === req.params.pageId)
    .sort((a, b) => b.timestamp - a.timestamp);
  res.json(versions);
});

app.post('/api/versions/:pageId/:versionId/restore', requireRole('editor'), (req, res) => {
  const versions = readJsonFile(VERSIONS_FILE);
  const version = versions.find(v => v.id === req.params.versionId && v.pageId === req.params.pageId);
  if (!version) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const pages = readPagesFile();
  const targetIndex = pages.findIndex(p => p.id === req.params.pageId);
  if (targetIndex === -1) {
    return res.status(404).json({ error: 'Page no longer exists' });
  }

  // Snapshot current state before overwriting, so restoring is itself undoable
  snapshotChangedPages(pages, pages.map((p, i) => i === targetIndex ? version.snapshot : p));
  pages[targetIndex] = version.snapshot;
  writeJsonFile(PAGES_FILE, pages);
  appendAudit('Restored version', `Page "${version.snapshot.name}" restored to version from ${new Date(version.timestamp).toLocaleString()}`);

  res.json({ success: true, pages });
});

// 1c. Audit log API
app.get('/api/audit', (req, res) => {
  res.json(readJsonFile(AUDIT_FILE));
});

// 2. Library API
app.get('/api/library', (req, res) => {
  const library = readJsonFile(LIBRARY_FILE);
  res.json(library);
});

app.post('/api/library', requireRole('editor'), (req, res) => {
  const library = req.body;
  if (!library || !Array.isArray(library)) {
    return res.status(400).json({ error: 'Invalid library data structure' });
  }
  writeJsonFile(LIBRARY_FILE, library);
  res.json({ success: true, library });
});

// 2b. Media / Asset Library API
app.get('/api/media', (req, res) => {
  res.json(readJsonFile(MEDIA_FILE));
});

app.post('/api/media', requireRole('editor'), (req, res) => {
  const { name, mimeType, dataBase64 } = req.body;
  if (!name || !dataBase64) {
    return res.status(400).json({ error: 'name and dataBase64 are required' });
  }

  const id = 'media-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, '-');
  const filename = `${id}-${safeName}`;

  try {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const buffer = Buffer.from(dataBase64, 'base64');
    fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer);

    const entry = {
      id,
      name,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      size: buffer.length,
      uploadedAt: Date.now(),
      url: `/media/${filename}`
    };
    const media = readJsonFile(MEDIA_FILE);
    media.unshift(entry);
    writeJsonFile(MEDIA_FILE, media);
    appendAudit('Uploaded media', `"${name}" (${(buffer.length / 1024).toFixed(1)} KB)`);

    res.json({ success: true, entry });
  } catch (error) {
    console.error('Error saving media upload:', error);
    res.status(500).json({ error: 'Failed to save uploaded file' });
  }
});

app.delete('/api/media/:id', requireRole('admin'), (req, res) => {
  const media = readJsonFile(MEDIA_FILE);
  const entry = media.find(m => m.id === req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Media item not found' });
  }
  try {
    const filePath = path.join(MEDIA_DIR, entry.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error deleting media file:', error);
  }
  writeJsonFile(MEDIA_FILE, media.filter(m => m.id !== req.params.id));
  appendAudit('Deleted media', `"${entry.name}"`);
  res.json({ success: true });
});

// 2c. Redirects Manager API
const normalizeRedirectPath = (p) => String(p ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');

app.get('/api/redirects', (req, res) => {
  res.json(readJsonFile(REDIRECTS_FILE));
});

app.post('/api/redirects', requireRole('admin'), (req, res) => {
  const { from, to, type } = req.body;
  const cleanFrom = normalizeRedirectPath(from);
  const cleanTo = (to || '').trim();
  if (!cleanFrom || !cleanTo) {
    return res.status(400).json({ error: 'from and to are required' });
  }
  const redirects = readJsonFile(REDIRECTS_FILE);
  if (redirects.some(r => r.from === cleanFrom)) {
    return res.status(400).json({ error: `A redirect from "/${cleanFrom}" already exists.` });
  }
  const entry = { id: 'redir-' + Date.now(), from: cleanFrom, to: cleanTo, type: type === 301 || type === '301' ? 301 : 302, createdAt: Date.now() };
  redirects.push(entry);
  writeJsonFile(REDIRECTS_FILE, redirects);
  appendAudit('Added redirect', `/${cleanFrom} → ${cleanTo}`);
  res.json({ success: true, entry });
});

app.delete('/api/redirects/:id', requireRole('admin'), (req, res) => {
  const redirects = readJsonFile(REDIRECTS_FILE);
  const entry = redirects.find(r => r.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Redirect not found' });
  writeJsonFile(REDIRECTS_FILE, redirects.filter(r => r.id !== req.params.id));
  appendAudit('Deleted redirect', `/${entry.from} → ${entry.to}`);
  res.json({ success: true });
});

// 2d. Inline Review Comments API
app.get('/api/comments', (req, res) => {
  const comments = readJsonFile(COMMENTS_FILE);
  res.json(req.query.pageId ? comments.filter(c => c.pageId === req.query.pageId) : comments);
});

app.post('/api/comments', requireRole('editor'), (req, res) => {
  const { pageId, sectionId, text, author } = req.body;
  if (!pageId || !sectionId || !text?.trim()) {
    return res.status(400).json({ error: 'pageId, sectionId, and text are required' });
  }
  const entry = {
    id: 'comment-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
    pageId, sectionId,
    text: text.trim(),
    author: author || req.userRole,
    resolved: false,
    createdAt: Date.now()
  };
  const comments = readJsonFile(COMMENTS_FILE);
  comments.push(entry);
  writeJsonFile(COMMENTS_FILE, comments);
  res.json({ success: true, entry });
});

app.patch('/api/comments/:id', requireRole('editor'), (req, res) => {
  const comments = readJsonFile(COMMENTS_FILE);
  const idx = comments.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Comment not found' });
  comments[idx] = { ...comments[idx], resolved: !!req.body.resolved };
  writeJsonFile(COMMENTS_FILE, comments);
  res.json({ success: true, entry: comments[idx] });
});

app.delete('/api/comments/:id', requireRole('editor'), (req, res) => {
  const comments = readJsonFile(COMMENTS_FILE);
  writeJsonFile(COMMENTS_FILE, comments.filter(c => c.id !== req.params.id));
  res.json({ success: true });
});

// 2e. A/B Testing API
app.post('/api/ab-track', (req, res) => {
  const { sectionId, variantId, event } = req.body;
  if (!sectionId || !variantId || event !== 'click') {
    return res.status(400).json({ error: 'sectionId, variantId, and event="click" are required' });
  }
  recordAbEvent(sectionId, variantId, 'clicks');
  res.json({ success: true });
});

app.get('/api/ab-stats/:sectionId', (req, res) => {
  const stats = readJsonFile(AB_STATS_FILE, {});
  res.json(stats[req.params.sectionId] || {});
});

// 3. Export Site API (Static Site Generation)
app.post('/api/export', requireRole('editor'), (req, res) => {
  try {
    const pages = readPagesFile();
    const library = readJsonFile(LIBRARY_FILE);

    if (!fs.existsSync(DIST_SITE_DIR)) {
      fs.mkdirSync(DIST_SITE_DIR, { recursive: true });
    }

    const publishable = pages.filter(p => p.status === 'published');
    const skippedCount = pages.length - publishable.length;

    const exportedFiles = [];
    publishable.forEach(page => {
      const htmlContent = compilePageHtml(page, pages, library, globalSettings);
      const filename = `${getFullPath(page, pages)}.html`;
      const filePath = path.join(DIST_SITE_DIR, filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, htmlContent, 'utf8');
      exportedFiles.push(filename);
    });

    appendAudit('Published site', `Exported ${exportedFiles.length} pages${skippedCount ? `, skipped ${skippedCount} draft page(s)` : ''}`);

    res.json({
      success: true,
      message: `Successfully exported ${exportedFiles.length} pages.${skippedCount ? ` Skipped ${skippedCount} draft page(s).` : ''}`,
      files: exportedFiles,
      skipped: skippedCount
    });
  } catch (error) {
    console.error('Error exporting site:', error);
    res.status(500).json({ error: 'Failed to export site files' });
  }
});

// ================= DYNAMIC ROUTING =================
// Serves dynamic pages rendered directly from data store. Pages can be nested
// (parentId), so this manually matches the full request path against each
// page's computed path rather than relying on a single ":slug" route param
// or Express 5's wildcard route syntax (which changed between path-to-regexp
// versions and is easy to get silently wrong).
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();

  const requestPath = req.path.split('/').filter(Boolean).join('/');
  if (requestPath.startsWith('api') || requestPath.includes('.')) return next();

  const redirect = readJsonFile(REDIRECTS_FILE).find(r => r.from === requestPath);
  if (redirect) {
    const isAbsoluteOrRooted = /^https?:\/\//i.test(redirect.to) || redirect.to.startsWith('/');
    return res.redirect(redirect.type || 302, isAbsoluteOrRooted ? redirect.to : '/' + redirect.to);
  }

  const pages = readPagesFile();
  const library = readJsonFile(LIBRARY_FILE);

  const page = requestPath === ''
    ? (pages.find(p => p.slug === 'index') || pages[0])
    : pages.find(p => getFullPath(p, pages) === requestPath);

  if (!page) {
    if (requestPath === '') {
      return res.send('<h1>Welcome to Nexus CMS</h1><p>Please log in to your editor and create your first page.</p>');
    }
    return res.status(404).send('<h1>Page Not Found</h1><p>The requested page slug does not exist in the CMS database.</p>');
  }

  const isPreview = req.query.preview === '1' || req.query.preview === 'true';
  if (page.status !== 'published' && !isPreview) {
    return res.status(404).send('<h1>Page Not Published</h1><p>This page is currently a draft and is not publicly visible. Add ?preview=1 to the URL to preview it from the editor.</p>');
  }

  const abChoices = resolveAbChoicesForRequest(page, req, res);
  const renderedHtml = compilePageHtml(page, pages, library, globalSettings, abChoices);
  res.send(renderedHtml);
});

// Periodic safety net for scheduled publishing — readPagesFile() already
// applies due schedules on every request, but this catches the case where
// the scheduled time passes with no incoming requests at all.
setInterval(() => { readPagesFile(); }, 30000);

app.listen(PORT, () => {
  console.log(`CMS Backend running on port ${PORT}`);
  console.log(`- API endpoints starting with: http://localhost:${PORT}/api`);
  console.log(`- Live pages available at: http://localhost:${PORT}/{slug}`);
});
