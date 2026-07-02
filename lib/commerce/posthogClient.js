import { PostHog } from 'posthog-node';
import { env, hasPosthog } from './env.js';

const client = hasPosthog ? new PostHog(env.posthogApiKey, { host: env.posthogHost }) : null;

// Server-side capture — used for webhook-triggered events (purchase_completed)
// where there's no browser to fire posthog-js from. Local mode logs instead.
export function captureEvent(distinctId, event, properties = {}) {
  if (!hasPosthog) {
    console.log(`[commerce/posthog:local] ${event}`, { distinctId, ...properties });
    return;
  }
  client.capture({ distinctId, event, properties });
}
