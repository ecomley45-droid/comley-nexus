// Email builder API. Mounted by server.js via mountEmailApi(app).
//
// Gating mirrors the social layer: requireOrg + requireEmail (feature-flagged,
// or EMAIL_SANDBOX in dev) + requireRole for writes. Tracking + cron endpoints
// carry no session and are guarded differently (open token / cron secret).

import express from 'express';
import { requireRole } from '../auth.js';
import { BLOCK_LIST, BLOCK_TYPES, DEFAULT_SETTINGS } from './blocks.js';
import { compile } from './render.js';
import * as templates from './templates.js';
import * as campaigns from './campaigns.js';
import * as audience from './audience.js';
import * as ai from './ai.js';
import * as sender from './send.js';

const sandbox = () => process.env.EMAIL_SANDBOX === '1';

const requireOrg = (req, res, next) => {
  if (!req.viewer) return res.status(401).json({ error: 'Authentication required' });
  if (!req.org) return res.status(403).json({ error: 'No workspace on this account' });
  if (req.org.paused) return res.status(423).json({ error: 'Something went wrong. Please contact support.' });
  next();
};

const requireEmail = (req, res, next) => {
  if (!!req.org?.feature_flags?.email || sandbox()) return next();
  return res.status(403).json({ error: 'The email builder isn’t enabled for this workspace.' });
};

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || process.env.SOCIAL_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const provided = req.get('x-cron-secret') || req.body?.secret || req.query?.secret;
  return provided === secret;
}

export function mountEmailApi(app) {
  // ---- Builder metadata ----
  app.get('/api/email/status', requireOrg, (req, res) => {
    res.json({ enabled: !!req.org?.feature_flags?.email || sandbox(), sandbox: sandbox(), aiConfigured: ai.hasAI(), sendSandbox: sender.isSandbox() });
  });
  app.get('/api/email/blocks', requireOrg, requireEmail, (req, res) => {
    res.json({ blocks: BLOCK_LIST, defaults: Object.fromEntries(Object.entries(BLOCK_TYPES).map(([k, v]) => [k, v.defaults])), settings: DEFAULT_SETTINGS });
  });

  // ---- Live preview: document -> email HTML ----
  app.post('/api/email/preview', requireOrg, requireEmail, async (req, res, next) => {
    try {
      const { html, errors } = await compile(req.body?.document || {});
      res.json({ html, errors });
    } catch (e) { next(e); }
  });

  // ---- Templates (gallery + workspace) ----
  app.get('/api/email/templates', requireOrg, requireEmail, async (req, res, next) => {
    try { res.json({ templates: await templates.list(req.org.id) }); } catch (e) { next(e); }
  });
  app.get('/api/email/templates/:id', requireOrg, requireEmail, async (req, res, next) => {
    try {
      const t = await templates.get(req.params.id, req.org.id);
      if (!t) return res.status(404).json({ error: 'Template not found' });
      res.json(t);
    } catch (e) { next(e); }
  });
  app.post('/api/email/templates', requireOrg, requireEmail, requireRole('editor'), async (req, res, next) => {
    try { res.json(await templates.save(req.org.id, { ...req.body, createdBy: req.viewer.email })); } catch (e) { next(e); }
  });
  app.delete('/api/email/templates/:id', requireOrg, requireEmail, requireRole('editor'), async (req, res, next) => {
    try { await templates.remove(req.org.id, req.params.id); res.json({ success: true }); } catch (e) { next(e); }
  });

  // ---- AI ----
  const aiLimit = express.json(); // (shares the app-level rate limiter)
  app.post('/api/email/ai/generate', requireOrg, requireEmail, requireRole('editor'), aiLimit, async (req, res, next) => {
    try {
      const prompt = String(req.body?.prompt || '').trim();
      if (prompt.length < 8) return res.status(400).json({ error: 'Describe the email you want in a sentence or two.' });
      res.json({ document: await ai.generateTemplate(prompt) });
    } catch (e) { next(e); }
  });
  app.post('/api/email/ai/copy', requireOrg, requireEmail, requireRole('editor'), async (req, res, next) => {
    try { res.json(await ai.suggestCopy({ brief: req.body?.brief, tone: req.body?.tone })); } catch (e) { next(e); }
  });
  app.post('/api/email/ai/restyle', requireOrg, requireEmail, requireRole('editor'), async (req, res, next) => {
    try { res.json({ document: ai.applyBrand(req.body?.document, req.body?.theme || {}) }); } catch (e) { next(e); }
  });

  // ---- Campaigns ----
  app.get('/api/email/campaigns', requireOrg, requireEmail, async (req, res, next) => {
    try { res.json({ campaigns: await campaigns.list(req.org.id) }); } catch (e) { next(e); }
  });
  app.get('/api/email/campaigns/:id', requireOrg, requireEmail, async (req, res, next) => {
    try {
      const c = await campaigns.get(req.org.id, req.params.id);
      if (!c) return res.status(404).json({ error: 'Campaign not found' });
      const stats = await sender.campaignStats(c.id);
      res.json({ ...c, liveStats: stats });
    } catch (e) { next(e); }
  });
  app.post('/api/email/campaigns', requireOrg, requireEmail, requireRole('editor'), async (req, res, next) => {
    try { res.json(await campaigns.save(req.org.id, { ...req.body, createdBy: req.viewer.email })); } catch (e) { next(e); }
  });
  app.delete('/api/email/campaigns/:id', requireOrg, requireEmail, requireRole('editor'), async (req, res, next) => {
    try { await campaigns.remove(req.org.id, req.params.id); res.json({ success: true }); } catch (e) { next(e); }
  });

  // Audience size preview for the audience step.
  app.post('/api/email/audience/count', requireOrg, requireEmail, async (req, res, next) => {
    try { res.json({ count: await audience.count(req.org.id, req.body?.audience || {}) }); } catch (e) { next(e); }
  });

  // Send now, or schedule (when scheduledAt is set on the campaign).
  app.post('/api/email/campaigns/:id/send', requireOrg, requireEmail, requireRole('admin'), async (req, res, next) => {
    try {
      const c = await campaigns.get(req.org.id, req.params.id);
      if (!c) return res.status(404).json({ error: 'Campaign not found' });
      if (c.scheduledAt && new Date(c.scheduledAt).getTime() > Date.now()) {
        await campaigns.setStatus(c.id, 'scheduled');
        return res.json({ scheduled: true, scheduledAt: c.scheduledAt });
      }
      res.json(await sender.sendCampaign(req.org.id, c.id));
    } catch (e) { next(e); }
  });

  // Test send to a single address (doesn't touch stats/audience).
  app.post('/api/email/campaigns/:id/test', requireOrg, requireEmail, requireRole('editor'), async (req, res, next) => {
    try {
      const to = String(req.body?.email || req.viewer.email);
      const c = await campaigns.get(req.org.id, req.params.id);
      if (!c) return res.status(404).json({ error: 'Campaign not found' });
      const { html } = await compile(c.document);
      if (sender.isSandbox()) { console.log(`[email/sandbox] test "${c.subject}" -> ${to}`); return res.json({ sent: true, sandbox: true, to }); }
      const { Resend } = await import('resend');
      const client = new Resend(process.env.RESEND_API_KEY);
      await client.emails.send({ from: process.env.RESEND_FROM, to: [to], subject: `[Test] ${c.subject}`, html });
      res.json({ sent: true, to });
    } catch (e) { next(e); }
  });

  // ---- Contacts / profiles (built from engagement events) ----
  app.get('/api/email/contacts/:email', requireOrg, requireEmail, async (req, res, next) => {
    try {
      const email = String(req.params.email).toLowerCase();
      const events = await campaigns.eventsForContact(req.org.id, email);
      const counts = events.reduce((a, e) => ({ ...a, [e.type]: (a[e.type] || 0) + 1 }), {});
      res.json({ email, counts, events });
    } catch (e) { next(e); }
  });

  // ---- Tracking (public, token-guarded) ----
  app.get('/api/email/track/open/:token', async (req, res) => {
    const t = sender.readToken(req.params.token);
    if (t) campaigns.recordEvent(t.o, { campaignId: t.c, contactEmail: t.e, type: 'open' }).catch(() => {});
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.end(sender.PIXEL_GIF);
  });
  app.get('/api/email/track/click/:token', async (req, res) => {
    const t = sender.readToken(req.params.token);
    const url = String(req.query.u || '');
    const safe = /^https?:\/\//i.test(url) ? url : '/';
    if (t) campaigns.recordEvent(t.o, { campaignId: t.c, contactEmail: t.e, type: 'click', url: safe }).catch(() => {});
    res.redirect(302, safe);
  });
  // One-click unsubscribe (from a footer link you add pointing here).
  app.get('/api/email/unsubscribe/:token', async (req, res) => {
    const t = sender.readToken(req.params.token);
    if (t) { await campaigns.suppress(t.o, t.e).catch(() => {}); await campaigns.recordEvent(t.o, { campaignId: t.c, contactEmail: t.e, type: 'unsubscribe' }).catch(() => {}); }
    res.setHeader('Content-Type', 'text/html');
    res.send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>You’re unsubscribed</h2><p>You won’t receive further emails from this list.</p></body>');
  });

  // ---- Cron ----
  app.all('/api/email/cron/send-due', async (req, res) => {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await sender.sendDueSweep()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
