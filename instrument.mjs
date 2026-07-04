// Sentry init. Loaded before any http/express code runs (via `node --import`
// locally, and as the first import in api/index.js on Vercel). This is the
// contract the @sentry/node auto-instrumentation depends on.
//
// dotenv is loaded from .env.local for dev; Vercel supplies env vars via
// the platform and neither file exists in the function runtime, so those
// calls are silent no-ops.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === 'production' || !!process.env.SENTRY_FORCE_ENABLE,
    beforeSend(event) {
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
