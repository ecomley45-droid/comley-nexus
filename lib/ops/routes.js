// Ops endpoints (feedback assignments, threaded comments, systems, prefs,
// personal stats, dashboard, git pulls, schedule). Mounted from server.js
// via mountOpsApi(app). All data lives in Supabase now — same handler
// contract as before, backed by lib/storage.js.

import * as storage from '../storage.js';
import { requireRole as authRequireRole } from '../auth.js';

const viewer = (req) => req.viewer
  ? { email: req.viewer.email, name: req.viewer.name, image: req.viewer.image }
  : { email: 'anonymous', name: 'Anonymous', image: null };
const requireRole = authRequireRole;

const EDIT_WINDOW_MS = 60_000;
const noteFor = (t) => (t.description || '').split(/\r?\n/)[0].slice(0, 140);
const isClosed = (status) => status === 'resolved' || status === 'closed';

const audit = (action, detail) =>
  storage.audit.append(action, detail).catch(() => {});

// Map a raw feedback row (DB shape) to the shape the frontend consumes.
// The DB stores assignee_email; assignee_name/image are denormalized on
// write below so we don't have to join per read.
function mapFeedback(t) {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    urgent: !!t.urgent,
    description: t.description,
    expectedBehavior: t.expected_behavior,
    currentBehavior: t.current_behavior,
    area: t.area,
    path: t.path,
    reportedRole: t.reported_role,
    reportedBy: t.reported_by,
    screenshotUrl: t.screenshot_url,
    imageUrls: t.image_urls || [],
    assignee_email: t.assignee_email || null,
    assignee_name: t.assignee_name || null,
    assignee_image: t.assignee_image || null,
    system_id: t.system_id || null,
    createdAt: new Date(t.created_at).getTime(),
    updatedAt: new Date(t.updated_at).getTime(),
    resolved_at: t.resolved_at ? new Date(t.resolved_at).getTime() : null,
  };
}

async function loadAllFeedback() {
  return storage.feedback.list();
}

export function mountOpsApi(app) {
  // ---- Assignees: dev roster + active workload counts --------------------
  app.get('/api/feedback/assignees', async (req, res, next) => {
    try {
      const feedback = await loadAllFeedback();
      const prefs = await storage.preferences.all();
      const devs = Object.entries(prefs)
        .filter(([, p]) => p?.is_dev)
        .map(([email, p]) => ({ email, name: p.display_name || email, image: p.image || null }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const counts = new Map();
      for (const t of feedback) {
        if (t.assignee_email && !isClosed(t.status)) {
          counts.set(t.assignee_email, (counts.get(t.assignee_email) || 0) + 1);
        }
      }
      res.json(devs.map((d) => ({ ...d, active_count: counts.get(d.email) || 0 })));
    } catch (e) { next(e); }
  });

  // ---- Feedback assignment ----------------------------------------------
  app.patch('/api/feedback/:id/assignee', requireRole('editor'), async (req, res, next) => {
    try {
      const { email } = req.body || {};
      if (email == null) {
        const row = await storage.feedback.updateAssignee(req.params.id, null, null, null);
        if (!row) return res.status(404).json({ error: 'Ticket not found' });
        await audit('Feedback assigned', `${row.type} -> unassigned`);
        return res.json({ success: true, entry: row });
      }
      const dev = await storage.preferences.get(email);
      if (!dev?.is_dev) return res.status(400).json({ error: 'Unknown assignee' });
      const row = await storage.feedback.updateAssignee(req.params.id, email, dev.display_name || email, dev.image || null);
      if (!row) return res.status(404).json({ error: 'Ticket not found' });
      await audit('Feedback assigned', `${row.type} -> ${email}`);
      res.json({ success: true, entry: row });
    } catch (e) { next(e); }
  });

  // ---- Feedback system tagging ------------------------------------------
  app.patch('/api/feedback/:id/system', requireRole('editor'), async (req, res, next) => {
    try {
      const { system_id } = req.body || {};
      const row = await storage.feedback.updateSystem(req.params.id, system_id ?? null);
      if (!row) return res.status(404).json({ error: 'Ticket not found' });
      res.json({ success: true, entry: row });
    } catch (e) { next(e); }
  });

  // ---- Threaded comments ------------------------------------------------
  app.get('/api/feedback/:id/comments', async (req, res, next) => {
    try {
      const comments = await storage.feedbackComments.listForFeedback(req.params.id);
      res.json({ comments, viewer: viewer(req) });
    } catch (e) { next(e); }
  });

  app.post('/api/feedback/:id/comments', async (req, res, next) => {
    try {
      const { body } = req.body || {};
      if (!body?.trim()) return res.status(400).json({ error: 'Body required' });
      const v = viewer(req);
      const entry = await storage.feedbackComments.add({
        id: 'comment-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        feedbackId: req.params.id, authorEmail: v.email, body: body.trim(),
      });
      // Enrich response with author identity (denormalized from prefs)
      const prefs = await storage.preferences.get(v.email);
      res.status(201).json({
        ...entry,
        author_name: prefs.display_name || v.name,
        author_image: prefs.image || v.image,
      });
    } catch (e) { next(e); }
  });

  const gateComment = async (req, res) => {
    const v = viewer(req);
    const c = await storage.feedbackComments.get(req.params.commentId);
    if (!c || c.deleted_at) { res.status(404).json({ error: 'Comment not found' }); return null; }
    if (c.authorEmail !== v.email) { res.status(403).json({ error: 'You can only modify your own comments' }); return null; }
    if (Date.now() - new Date(c.created_at).getTime() > EDIT_WINDOW_MS) {
      res.status(403).json({ error: 'The edit window has passed' }); return null;
    }
    return c;
  };

  app.patch('/api/feedback/comments/:commentId', async (req, res, next) => {
    try {
      const c = await gateComment(req, res); if (!c) return;
      const { body } = req.body || {};
      if (!body?.trim()) return res.status(400).json({ error: 'Body required' });
      const updated = await storage.feedbackComments.edit(c.id, body.trim());
      res.json(updated);
    } catch (e) { next(e); }
  });

  app.delete('/api/feedback/comments/:commentId', async (req, res, next) => {
    try {
      const c = await gateComment(req, res); if (!c) return;
      await storage.feedbackComments.softDelete(c.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---- Systems (list with derived state + top tickets per system) --------
  app.get('/api/systems', async (req, res, next) => {
    try {
      const [systems, feedback] = await Promise.all([storage.systems.listOrdered(), loadAllFeedback()]);
      const withCounts = systems.map((s) => {
        const forSys = feedback.filter((t) => t.system_id === s.id);
        const active = forSys.filter((t) => !isClosed(t.status));
        const state = s.status === 'down' ? 'outage' : active.length > 0 ? 'issue' : 'available';
        const topTickets = active
          .slice()
          .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.createdAt - b.createdAt)
          .slice(0, 5)
          .map((t) => ({
            id: t.id, type: t.type, status: t.status, urgent: t.urgent,
            created_at: t.createdAt, assignee_name: t.assignee_name, assignee_image: t.assignee_image,
            note: noteFor(t),
          }));
        return { ...s, state, open: active.length, total: forSys.length, tickets: topTickets };
      });
      res.json(withCounts);
    } catch (e) { next(e); }
  });

  app.get('/api/systems/feature-requests', async (req, res, next) => {
    try {
      const [systems, feedback] = await Promise.all([storage.systems.listOrdered(), loadAllFeedback()]);
      const seen = new Map();
      const products = [];
      for (const s of systems) {
        const product = s.product || 'Other';
        if (!seen.has(product)) { seen.set(product, { product, systems: [] }); products.push(seen.get(product)); }
        const forSys = feedback.filter((t) => t.system_id === s.id && t.type === 'feature_request');
        const active = forSys.filter((t) => !isClosed(t.status));
        const tickets = active
          .slice()
          .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.createdAt - b.createdAt)
          .slice(0, 5)
          .map((t) => ({
            id: t.id, status: t.status, urgent: t.urgent, created_at: t.createdAt,
            assignee_name: t.assignee_name, assignee_image: t.assignee_image, note: noteFor(t),
          }));
        seen.get(product).systems.push({ id: s.id, name: s.name, count: active.length, tickets });
      }
      res.json(products);
    } catch (e) { next(e); }
  });

  // ---- User preferences (per viewer) ------------------------------------
  const emptyPrefs = () => ({
    view: null, detail_mode: null, schedule_order: null,
    work_start: null, work_end: null, work_days: null,
    integrations: {}, ai_settings: {},
  });
  const projectPrefs = (p) => ({
    view: p.view ?? null,
    detail_mode: p.detail_mode ?? null,
    schedule_order: p.schedule_order ?? null,
    work_start: p.work_start ?? null,
    work_end: p.work_end ?? null,
    work_days: p.work_days ?? null,
    integrations: p.integrations || {},
    ai_settings: p.ai_settings || {},
  });

  app.get('/api/user/preferences', async (req, res, next) => {
    try {
      const v = viewer(req);
      const p = await storage.preferences.get(v.email);
      res.json(p && Object.keys(p).length ? projectPrefs(p) : emptyPrefs());
    } catch (e) { next(e); }
  });

  app.patch('/api/user/preferences', async (req, res, next) => {
    try {
      const v = viewer(req);
      const patch = req.body || {};
      // Backfill identity on first save so the viewer shows up in dropdowns.
      const existing = await storage.preferences.get(v.email);
      const backfill = {};
      if (!existing.display_name) backfill.display_name = v.name;
      if (existing.image === undefined) backfill.image = v.image;
      if (existing.is_dev === undefined) backfill.is_dev = true;
      const next = await storage.preferences.patch(v.email, { ...backfill, ...patch });
      res.json(projectPrefs(next));
    } catch (e) { next(e); }
  });

  // ---- Personal stats over a period -------------------------------------
  app.get('/api/user/stats', async (req, res, next) => {
    try {
      const v = viewer(req);
      const period = String(req.query.period || 'month');
      const now = new Date();
      let start;
      switch (period) {
        case 'today': start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
        case 'week': {
          const d = new Date(now); const dow = d.getDay() || 7;
          d.setDate(d.getDate() - (dow - 1)); d.setHours(0, 0, 0, 0); start = d; break;
        }
        case 'month': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
        case 'quarter': start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
        case 'year': start = new Date(now.getFullYear(), 0, 1); break;
        default: start = new Date(0);
      }
      const startMs = start.getTime();
      const feedback = await loadAllFeedback();
      const mine = feedback.filter((t) => t.assignee_email === v.email);
      const openCount = mine.filter((t) => !isClosed(t.status) && t.createdAt >= startMs).length;
      const done = mine.filter((t) => t.resolved_at && t.resolved_at >= startMs);
      const durations = done.map((t) => (t.resolved_at - t.createdAt) / 1000);
      const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
      const best = durations.length ? Math.min(...durations) : null;
      const worst = durations.length ? Math.max(...durations) : null;
      const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dowCounts = new Array(7).fill(0);
      for (const t of done) dowCounts[new Date(t.resolved_at).getDay()]++;
      let bestDow = null; let bestDowCount = 0;
      for (let i = 0; i < 7; i++) if (dowCounts[i] > bestDowCount) { bestDow = i; bestDowCount = dowCounts[i]; }
      res.json({
        period, openCount, completedCount: done.length,
        avgCompletionSec: avg, bestCompletionSec: best, worstCompletionSec: worst,
        mostProductiveDay: bestDow != null ? { dow: bestDow, label: DOW[bestDow], count: bestDowCount } : null,
      });
    } catch (e) { next(e); }
  });

  // ---- Dashboard aggregate ---------------------------------------------
  app.get('/api/ops/dashboard', async (req, res, next) => {
    try {
      const [systems, feedback] = await Promise.all([storage.systems.listOrdered(), loadAllFeedback()]);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const calendar = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, submitted: 0, completed: 0 }));
      for (const t of feedback) {
        const d = new Date(t.createdAt);
        if (d >= monthStart) {
          calendar[d.getDate() - 1].submitted++;
          if (isClosed(t.status)) calendar[d.getDate() - 1].completed++;
        }
      }
      const topTickets = feedback
        .filter((t) => !isClosed(t.status))
        .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.createdAt - b.createdAt)
        .slice(0, 5)
        .map((t) => ({
          id: t.id, type: t.type, status: t.status, urgent: t.urgent, created_at: t.createdAt,
          assignee_name: t.assignee_name, assignee_image: t.assignee_image, note: noteFor(t),
        }));
      const thirty = Date.now() - 30 * 86400_000;
      const last30 = feedback.filter((t) => t.createdAt >= thirty);
      const dailyAvg = last30.length / 30;
      const done = feedback.filter((t) => t.resolved_at);
      const avgSec = done.length ? done.reduce((s, t) => s + (t.resolved_at - t.createdAt) / 1000, 0) / done.length : null;
      const perSys = new Map();
      for (const t of feedback) if (t.system_id) perSys.set(t.system_id, (perSys.get(t.system_id) || 0) + 1);
      let highest = null; let highestCount = 0;
      for (const [sid, count] of perSys) if (count > highestCount) { highest = sid; highestCount = count; }
      const highestName = highest ? (systems.find((s) => s.id === highest)?.name || '—') : '—';
      const bento = systems.map((s) => {
        const forSys = feedback.filter((t) => t.system_id === s.id);
        const active = forSys.filter((t) => !isClosed(t.status));
        const state = s.status === 'down' ? 'outage' : active.length > 0 ? 'issue' : 'available';
        return { id: s.id, name: s.name, state, open: active.length, total: forSys.length };
      });
      res.json({
        monthLabel: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        calendar, topTickets, dailyAvg, avgCompletionSec: avgSec,
        highestService: { name: highestName, count: highestCount }, systems: bento,
      });
    } catch (e) { next(e); }
  });

  // ---- Git pulls --------------------------------------------------------
  app.get('/api/git-pulls', async (req, res, next) => {
    try {
      const { repos, branches } = await storage.repos.listWithBranches();
      const grouped = new Map();
      for (const r of repos) {
        if (!grouped.has(r.platform)) grouped.set(r.platform, { platform: r.platform, branches: [] });
        const rBranches = branches
          .filter((b) => b.repo_id === r.id)
          .map((b) => ({ ...b, repo_name: r.name }));
        grouped.get(r.platform).branches.push(...rBranches);
      }
      res.json(Array.from(grouped.values()));
    } catch (e) { next(e); }
  });

  app.post('/api/git-pulls', async (req, res, next) => {
    try {
      const v = viewer(req);
      const { branch_id } = req.body || {};
      if (!branch_id) return res.status(400).json({ error: 'branch_id required' });
      const row = await storage.repos.touchBranch(branch_id, { email: v.email, name: v.name });
      if (!row) return res.status(404).json({ error: 'Branch not found' });
      await storage.gitPulls.record({ branchId: branch_id, userEmail: v.email }).catch(() => {});
      res.json(row);
    } catch (e) { next(e); }
  });

  // ---- Schedule roster --------------------------------------------------
  app.get('/api/ops/schedule', async (req, res, next) => {
    try {
      const prefs = await storage.preferences.all();
      const devs = Object.entries(prefs)
        .filter(([, p]) => p?.is_dev)
        .map(([email, p]) => ({
          email, name: p.display_name || email, image: p.image || null,
          work_start: p.work_start ?? null, work_end: p.work_end ?? null, work_days: p.work_days ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(devs);
    } catch (e) { next(e); }
  });
}
