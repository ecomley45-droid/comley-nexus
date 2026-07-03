// Ops endpoints for feedback assignments, threaded comments, systems status,
// user preferences, personal stats, and git-pull tracking. Mirrors the pattern
// used by lib/commerce/routes.js: mounted from server.js via mountOpsApi(app).
// All data lives in data/*.json (same trust-based simulation as the rest of
// this repo — X-User-Role from the client, viewer identity from headers).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'feedback-comments.json');
const SYSTEMS_FILE = path.join(DATA_DIR, 'systems.json');
const PREFS_FILE = path.join(DATA_DIR, 'user-preferences.json');
const REPOS_FILE = path.join(DATA_DIR, 'repos.json');
const BRANCHES_FILE = path.join(DATA_DIR, 'repo-branches.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');

const readJson = (p, dv = []) => {
  try {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(dv, null, 2));
      return dv;
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return dv;
  }
};
const writeJson = (p, d) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
};
const appendAudit = (action, detail) => {
  try {
    const audit = readJson(AUDIT_FILE);
    audit.unshift({ id: 'audit-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), action, detail, at: Date.now() });
    writeJson(AUDIT_FILE, audit.slice(0, 500));
  } catch {
    /* audit is best-effort */
  }
};

// Viewer identity + role come from the Clerk-backed req.viewer that
// resolveViewer() in lib/auth.js attaches for us. No more trusting
// X-User-* headers from the client.
import { requireRole as authRequireRole } from '../auth.js';
const viewer = (req) => req.viewer
  ? { email: req.viewer.email, name: req.viewer.name, image: req.viewer.image }
  : { email: 'anonymous', name: 'Anonymous', image: null };
const requireRole = authRequireRole;

// Comments can be edited/deleted by the author for one minute after posting.
const EDIT_WINDOW_MS = 60_000;

// Short truncated summary of a ticket used across list-style ops surfaces.
const noteFor = (ticket) =>
  (ticket.description || '').split(/\r?\n/)[0].slice(0, 140);

const isClosed = (status) => status === 'resolved' || status === 'closed';

export function mountOpsApi(app) {
  // ---- Assignees: dev roster + active workload counts --------------------
  app.get('/api/feedback/assignees', (req, res) => {
    const feedback = readJson(FEEDBACK_FILE);
    const prefs = readJson(PREFS_FILE, {});
    const devs = Object.entries(prefs)
      .filter(([, p]) => p?.is_dev)
      .map(([email, p]) => ({
        email,
        name: p.display_name || email,
        image: p.image || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const activeCounts = new Map();
    for (const t of feedback) {
      if (t.assignee_email && !isClosed(t.status)) {
        activeCounts.set(t.assignee_email, (activeCounts.get(t.assignee_email) || 0) + 1);
      }
    }
    res.json(devs.map((d) => ({ ...d, active_count: activeCounts.get(d.email) || 0 })));
  });

  // ---- Feedback assignment ----------------------------------------------
  app.patch('/api/feedback/:id/assignee', requireRole('editor'), (req, res) => {
    const { email } = req.body || {};
    const feedback = readJson(FEEDBACK_FILE);
    const idx = feedback.findIndex((f) => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });

    if (email == null) {
      feedback[idx] = {
        ...feedback[idx],
        assignee_email: null,
        assignee_name: null,
        assignee_image: null,
        updatedAt: Date.now(),
      };
    } else {
      const prefs = readJson(PREFS_FILE, {});
      const dev = prefs[email];
      if (!dev?.is_dev) return res.status(400).json({ error: 'Unknown assignee' });
      feedback[idx] = {
        ...feedback[idx],
        assignee_email: email,
        assignee_name: dev.display_name || email,
        assignee_image: dev.image || null,
        updatedAt: Date.now(),
      };
    }
    writeJson(FEEDBACK_FILE, feedback);
    appendAudit('Feedback assigned', `${feedback[idx].type} -> ${email || 'unassigned'}`);
    res.json({ success: true, entry: feedback[idx] });
  });

  // ---- Feedback system tagging ------------------------------------------
  app.patch('/api/feedback/:id/system', requireRole('editor'), (req, res) => {
    const { system_id } = req.body || {};
    const feedback = readJson(FEEDBACK_FILE);
    const idx = feedback.findIndex((f) => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });
    feedback[idx] = { ...feedback[idx], system_id: system_id ?? null, updatedAt: Date.now() };
    writeJson(FEEDBACK_FILE, feedback);
    res.json({ success: true, entry: feedback[idx] });
  });

  // ---- Threaded comments ------------------------------------------------
  app.get('/api/feedback/:id/comments', (req, res) => {
    const all = readJson(COMMENTS_FILE);
    const comments = all
      .filter((c) => c.ticket_id === req.params.id)
      .sort((a, b) => a.created_at - b.created_at);
    res.json({ comments, viewer: viewer(req) });
  });

  app.post('/api/feedback/:id/comments', (req, res) => {
    const { body } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: 'Body required' });
    const v = viewer(req);
    const entry = {
      id: 'comment-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      ticket_id: req.params.id,
      author_email: v.email,
      author_name: v.name,
      author_image: v.image,
      body: body.trim(),
      created_at: Date.now(),
      updated_at: null,
      edited: false,
    };
    const all = readJson(COMMENTS_FILE);
    all.push(entry);
    writeJson(COMMENTS_FILE, all);
    res.status(201).json(entry);
  });

  const gateComment = (req, res) => {
    const v = viewer(req);
    const all = readJson(COMMENTS_FILE);
    const idx = all.findIndex((c) => c.id === req.params.commentId);
    if (idx === -1) {
      res.status(404).json({ error: 'Comment not found' });
      return null;
    }
    const c = all[idx];
    if (c.author_email !== v.email) {
      res.status(403).json({ error: 'You can only modify your own comments' });
      return null;
    }
    if (Date.now() - c.created_at > EDIT_WINDOW_MS) {
      res.status(403).json({ error: 'The edit window has passed' });
      return null;
    }
    return { all, idx, comment: c };
  };

  app.patch('/api/feedback/comments/:commentId', (req, res) => {
    const g = gateComment(req, res);
    if (!g) return;
    const { body } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: 'Body required' });
    g.all[g.idx] = { ...g.comment, body: body.trim(), updated_at: Date.now(), edited: true };
    writeJson(COMMENTS_FILE, g.all);
    res.json(g.all[g.idx]);
  });

  app.delete('/api/feedback/comments/:commentId', (req, res) => {
    const g = gateComment(req, res);
    if (!g) return;
    g.all.splice(g.idx, 1);
    writeJson(COMMENTS_FILE, g.all);
    res.json({ ok: true });
  });

  // ---- Systems (list with derived state + top tickets per system) --------
  app.get('/api/systems', (req, res) => {
    const systems = readJson(SYSTEMS_FILE);
    const feedback = readJson(FEEDBACK_FILE);
    const withCounts = systems
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => {
        const forSys = feedback.filter((t) => t.system_id === s.id);
        const active = forSys.filter((t) => !isClosed(t.status));
        const state = s.status === 'down' ? 'outage' : active.length > 0 ? 'issue' : 'available';
        const topTickets = active
          .slice()
          .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.createdAt - b.createdAt)
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            type: t.type,
            status: t.status,
            urgent: !!t.urgent,
            created_at: t.createdAt,
            assignee_name: t.assignee_name || null,
            assignee_image: t.assignee_image || null,
            note: noteFor(t),
          }));
        return { ...s, state, open: active.length, total: forSys.length, tickets: topTickets };
      });
    res.json(withCounts);
  });

  // Feature-requests view: same data, grouped by product with feature-only counts.
  app.get('/api/systems/feature-requests', (req, res) => {
    const systems = readJson(SYSTEMS_FILE);
    const feedback = readJson(FEEDBACK_FILE);
    const products = [];
    const seen = new Map();
    systems
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .forEach((s) => {
        const product = s.product || 'Other';
        if (!seen.has(product)) {
          seen.set(product, { product, systems: [] });
          products.push(seen.get(product));
        }
        const forSys = feedback.filter(
          (t) => t.system_id === s.id && t.type === 'feature_request',
        );
        const active = forSys.filter((t) => !isClosed(t.status));
        const tickets = active
          .slice()
          .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.createdAt - b.createdAt)
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            status: t.status,
            urgent: !!t.urgent,
            created_at: t.createdAt,
            assignee_name: t.assignee_name || null,
            assignee_image: t.assignee_image || null,
            note: noteFor(t),
          }));
        seen.get(product).systems.push({
          id: s.id,
          name: s.name,
          count: active.length,
          tickets,
        });
      });
    res.json(products);
  });

  // ---- User preferences (per viewer) ------------------------------------
  const emptyPrefs = () => ({
    view: null,
    detail_mode: null,
    schedule_order: null,
    work_start: null,
    work_end: null,
    work_days: null,
    integrations: {},
    ai_settings: {},
  });

  const projectPrefs = (row) => ({
    view: row.view ?? null,
    detail_mode: row.detail_mode ?? null,
    schedule_order: row.schedule_order ?? null,
    work_start: row.work_start ?? null,
    work_end: row.work_end ?? null,
    work_days: row.work_days ?? null,
    integrations: row.integrations || {},
    ai_settings: row.ai_settings || {},
  });

  app.get('/api/user/preferences', (req, res) => {
    const v = viewer(req);
    const prefs = readJson(PREFS_FILE, {});
    const row = prefs[v.email];
    if (!row) return res.json(emptyPrefs());
    res.json(projectPrefs(row));
  });

  app.patch('/api/user/preferences', (req, res) => {
    const v = viewer(req);
    const patch = req.body || {};
    const prefs = readJson(PREFS_FILE, {});
    const existing = prefs[v.email] || {};
    // Shallow merge overall; `integrations` merges one level deeper (per key),
    // and `ai_settings` merges two levels deeper (per-provider config keys)
    // so callers can update one field without wiping the rest.
    const next = { ...existing };
    for (const key of Object.keys(patch)) {
      if (key === 'integrations' && patch.integrations && typeof patch.integrations === 'object') {
        next.integrations = { ...(existing.integrations || {}), ...patch.integrations };
      } else if (key === 'ai_settings' && patch.ai_settings && typeof patch.ai_settings === 'object') {
        const merged = { ...(existing.ai_settings || {}) };
        for (const [providerId, cfg] of Object.entries(patch.ai_settings)) {
          merged[providerId] = { ...(merged[providerId] || {}), ...(cfg || {}) };
        }
        next.ai_settings = merged;
      } else {
        next[key] = patch[key];
      }
    }
    // Backfill identity + is_dev on first save so the viewer shows up as
    // themself in Schedule/assignee dropdowns.
    if (!next.display_name) next.display_name = v.name;
    if (next.image === undefined) next.image = v.image;
    if (next.is_dev === undefined) next.is_dev = true;
    prefs[v.email] = next;
    writeJson(PREFS_FILE, prefs);
    res.json(projectPrefs(next));
  });

  // ---- Personal stats over a period -------------------------------------
  app.get('/api/user/stats', (req, res) => {
    const v = viewer(req);
    const period = String(req.query.period || 'month');
    const now = new Date();
    let start;
    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week': {
        // ISO week: Monday as first day.
        const d = new Date(now);
        const dow = d.getDay() || 7; // Sun -> 7
        d.setDate(d.getDate() - (dow - 1));
        d.setHours(0, 0, 0, 0);
        start = d;
        break;
      }
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(0);
    }
    const startMs = start.getTime();
    const feedback = readJson(FEEDBACK_FILE);
    const mine = feedback.filter((t) => t.assignee_email === v.email);

    const openCount = mine.filter(
      (t) => !isClosed(t.status) && t.createdAt >= startMs,
    ).length;
    const done = mine.filter((t) => t.resolved_at && t.resolved_at >= startMs);
    const durations = done.map((t) => (t.resolved_at - t.createdAt) / 1000);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const best = durations.length ? Math.min(...durations) : null;
    const worst = durations.length ? Math.max(...durations) : null;

    const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dowCounts = new Array(7).fill(0);
    for (const t of done) dowCounts[new Date(t.resolved_at).getDay()]++;
    let bestDow = null;
    let bestDowCount = 0;
    for (let i = 0; i < 7; i++) if (dowCounts[i] > bestDowCount) { bestDow = i; bestDowCount = dowCounts[i]; }

    res.json({
      period,
      openCount,
      completedCount: done.length,
      avgCompletionSec: avg,
      bestCompletionSec: best,
      worstCompletionSec: worst,
      mostProductiveDay: bestDow != null ? { dow: bestDow, label: DOW[bestDow], count: bestDowCount } : null,
    });
  });

  // ---- Dashboard aggregate (calendar + top priority tickets + averages) --
  app.get('/api/ops/dashboard', (req, res) => {
    const feedback = readJson(FEEDBACK_FILE);
    const systems = readJson(SYSTEMS_FILE);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const calendar = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      submitted: 0,
      completed: 0,
    }));
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
        id: t.id,
        type: t.type,
        status: t.status,
        urgent: !!t.urgent,
        created_at: t.createdAt,
        assignee_name: t.assignee_name || null,
        assignee_image: t.assignee_image || null,
        note: noteFor(t),
      }));

    // Daily average over the last 30 days.
    const thirty = Date.now() - 30 * 86400_000;
    const last30 = feedback.filter((t) => t.createdAt >= thirty);
    const dailyAvg = last30.length / 30;

    // Avg time to complete (all-time).
    const done = feedback.filter((t) => t.resolved_at);
    const avgSec = done.length
      ? done.reduce((s, t) => s + (t.resolved_at - t.createdAt) / 1000, 0) / done.length
      : null;

    // Highest ticketed system.
    const perSys = new Map();
    for (const t of feedback) if (t.system_id) perSys.set(t.system_id, (perSys.get(t.system_id) || 0) + 1);
    let highest = null;
    let highestCount = 0;
    for (const [sid, count] of perSys) {
      if (count > highestCount) { highest = sid; highestCount = count; }
    }
    const highestName = highest ? systems.find((s) => s.id === highest)?.name || '—' : '—';

    // Systems bento summary (same as /api/systems but slim).
    const bento = systems
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => {
        const forSys = feedback.filter((t) => t.system_id === s.id);
        const active = forSys.filter((t) => !isClosed(t.status));
        const state = s.status === 'down' ? 'outage' : active.length > 0 ? 'issue' : 'available';
        return { id: s.id, name: s.name, state, open: active.length, total: forSys.length };
      });

    res.json({
      monthLabel: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      calendar,
      topTickets,
      dailyAvg,
      avgCompletionSec: avgSec,
      highestService: { name: highestName, count: highestCount },
      systems: bento,
    });
  });

  // ---- Git pulls (platforms -> branches with last-pull tracking) ---------
  app.get('/api/git-pulls', (req, res) => {
    const repos = readJson(REPOS_FILE).slice().sort((a, b) => a.display_order - b.display_order);
    const branches = readJson(BRANCHES_FILE);
    const grouped = new Map();
    for (const r of repos) {
      if (!grouped.has(r.platform)) grouped.set(r.platform, { platform: r.platform, branches: [] });
      const rBranches = branches
        .filter((b) => b.repo_id === r.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map((b) => ({ ...b, repo_name: r.name }));
      grouped.get(r.platform).branches.push(...rBranches);
    }
    res.json(Array.from(grouped.values()));
  });

  app.post('/api/git-pulls', (req, res) => {
    const v = viewer(req);
    const { branch_id } = req.body || {};
    if (!branch_id) return res.status(400).json({ error: 'branch_id required' });
    const branches = readJson(BRANCHES_FILE);
    const idx = branches.findIndex((b) => b.id === branch_id);
    if (idx === -1) return res.status(404).json({ error: 'Branch not found' });
    branches[idx] = {
      ...branches[idx],
      last_pulled_by_email: v.email,
      last_pulled_by_name: v.name,
      last_pulled_at: Date.now(),
    };
    writeJson(BRANCHES_FILE, branches);
    res.json(branches[idx]);
  });

  // ---- Schedule roster (devs from prefs) --------------------------------
  app.get('/api/ops/schedule', (req, res) => {
    const prefs = readJson(PREFS_FILE, {});
    const devs = Object.entries(prefs)
      .filter(([, p]) => p?.is_dev)
      .map(([email, p]) => ({
        email,
        name: p.display_name || email,
        image: p.image || null,
        work_start: p.work_start ?? null,
        work_end: p.work_end ?? null,
        work_days: p.work_days ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(devs);
  });
}
