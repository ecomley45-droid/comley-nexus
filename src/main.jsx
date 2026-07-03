import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import * as Sentry from '@sentry/react';
import App from './App.jsx';
import './index.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

// Wire Sentry only when a DSN is configured. Missing DSN = silent no-op so
// local dev without a Sentry project set up still works.
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    // Only send errors from real deploys. Set VITE_SENTRY_FORCE_ENABLE=1
    // to test locally without polluting the prod project.
    enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_FORCE_ENABLE === '1',
    integrations: [
      Sentry.browserTracingIntegration(),
      // 10% of normal sessions get recorded, 100% of sessions with errors.
      // This is the "watch the user's screen right before the crash" view.
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Strip Clerk emails/user IDs from breadcrumb URLs before shipping.
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/user_[a-zA-Z0-9]+/g, 'user_[redacted]');
      }
      return event;
    },
  });
}

// Only wrap in ClerkProvider once a publishable key exists — it throws if
// given an empty key, and local dev mode (see useCommerceUser.js) doesn't
// need it at all.
const root = (
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>
);

createRoot(document.getElementById('root')).render(root);
