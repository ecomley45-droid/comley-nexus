import posthog from 'posthog-js';

const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;

if (apiKey) {
  posthog.init(apiKey, { api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com' });
}

// No-op logger in local mode so call sites don't need to branch on config.
export function track(event, properties = {}) {
  if (!apiKey) {
    console.log(`[posthog:local] ${event}`, properties);
    return;
  }
  posthog.capture(event, properties);
}
