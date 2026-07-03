// MUST be the first import in server.js. Sentry's auto-instrumentation
// patches Node internals (http, fs, express) at load time — if any other
// module is imported before this, those patches miss it and traces/errors
// from that module come through unattributed.
//
// The DSN is read from env at startup. Missing DSN = no-op (helpful for
// local dev without Sentry set up yet).
// Load .env.local first (dev convention), then .env as fallback. dotenv
// doesn't overwrite already-set vars, so `.env.local` wins where both set
// the same key. In prod (Vercel), env vars come from the platform and
// neither file exists — dotenv silently does nothing, which is the desired
// behavior.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // 10% of successful requests get a performance trace. Bumping this to
    // 1.0 in a debug session is fine; leaving it high burns the free tier.
    tracesSampleRate: 0.1,
    // Only send errors from real deploys — skip local dev noise.
    enabled: process.env.NODE_ENV === 'production' || !!process.env.SENTRY_FORCE_ENABLE,
    beforeSend(event) {
      // Scrub obvious PII before it leaves the server. Clerk emails/tokens
      // sometimes end up in error messages via req.viewer.
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  console.log('[sentry] Node SDK initialized');
} else {
  console.log('[sentry] SENTRY_DSN not set — skipping init');
}
