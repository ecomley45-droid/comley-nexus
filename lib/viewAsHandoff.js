// Redeems a view-as handoff token minted by Nexus Command
// (POST /api/impersonate/cms/:orgId in nexus-core's apps/command/server.js)
// for CMS's own first-party VIEW_AS_COOKIE.
//
// Why this exists: Command, Field, and CMS are on three different root
// domains today (comleynexus.com / nexusfieldhub.com / nexuscmshub.com), so
// a cookie Command's browser session carries can never be read here — no
// shared cookie domain exists to rely on. Rather than loosening CORS/
// SameSite to allow a cross-origin cookie write (real attack-surface
// expansion: any origin allowed through that door could ride a signed-in
// super-admin's browser to open a workspace), Command instead mints a
// short-lived signed token and hands the OPERATOR'S OWN BROWSER a same-
// origin POST to make here. That's a normal top-level form navigation, not
// a fetch/XHR, so it isn't subject to CORS at all — and CMS then sets its
// OWN cookie, on its OWN origin, which SameSite:Lax already allows.
//
// The token itself never touches a URL bar, browser history, or Referer
// header — Command's frontend builds a hidden <form method="POST"> and
// submits it, so the token travels only in that one request body.
//
// Single-use, best-effort: a used token's jti is remembered for a few
// minutes to reject replay within THIS server instance. On Vercel's
// multi-instance serverless, that dedup doesn't span instances, so this is
// defense in depth on top of the 60s expiry, not the sole control — a
// captured, still-live token could in principle be replayed against a
// different instance within that ~60s window. Worth knowing about; not
// worth a shared store for a token this short-lived and this rarely issued.
import express from 'express';
import { verifyViewAsToken } from './viewAsToken.js';
import * as storage from './storage.js';
import { VIEW_AS_COOKIE, ROLE_RANK } from './auth.js';
import { VIEW_AS_COOKIE_OPTIONS } from './superAdminRoutes.js';

// Command's frontend submits a hidden HTML form (application/x-www-form-
// urlencoded), not JSON -- see this file's header for why (a real top-level
// navigation, not fetch/XHR, so it sidesteps CORS entirely). The app-wide
// express.json() in server.js doesn't parse that content type, so this
// route gets its own urlencoded parser, same pattern as server.js's
// POST /api/public/forms.
const parseForm = express.urlencoded({ extended: false, limit: '4kb' });

const usedNonces = new Map(); // jti -> expiresAt(ms)
const NONCE_TTL_MS = 5 * 60 * 1000;
const NONCE_CACHE_MAX = 5000;

function alreadyUsed(jti) {
  if (!jti) return false; // no jti on the token -- can't dedup, don't block on it
  const now = Date.now();
  if (usedNonces.size > NONCE_CACHE_MAX) usedNonces.clear(); // cheap bound, rare path
  for (const [key, exp] of usedNonces) if (exp < now) usedNonces.delete(key);
  if (usedNonces.has(jti)) return true;
  usedNonces.set(jti, now + NONCE_TTL_MS);
  return false;
}

export function mountViewAsHandoff(app) {
  app.post('/api/view-as/accept', parseForm, async (req, res) => {
    const token = req.body?.token;
    const payload = verifyViewAsToken(token, { audience: 'cms' });
    if (!payload) return res.status(400).send('This view-as link is invalid or has expired. Return to Nexus Command and try again.');
    if (alreadyUsed(payload.jti)) return res.status(400).send('This view-as link has already been used.');
    const org = await storage.orgs.get(payload.orgId).catch(() => null);
    if (!org) return res.status(404).send('Workspace not found.');
    const role = ROLE_RANK.hasOwnProperty(payload.role) ? payload.role : 'admin';
    res.cookie(VIEW_AS_COOKIE, JSON.stringify({ org: org.id, role }), VIEW_AS_COOKIE_OPTIONS);
    res.redirect(302, '/super-admin');
  });

  // Clearing removes only this browser's own cookie -- not a privilege
  // grant, so no auth/token needed (mirrors CMS's own
  // POST /api/super-admin/view-as/clear, just reachable without a CMS
  // session so Command can link straight to it).
  app.get('/api/view-as/clear', (_req, res) => {
    res.clearCookie(VIEW_AS_COOKIE);
    res.redirect(302, '/');
  });
}
