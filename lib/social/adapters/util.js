// Shared helpers for the live platform adapters.

// Thrown when a real adapter is asked to do work but its platform app
// credentials aren't set. resolveAdapter() (index.js) treats a platform as
// unconfigured up front and routes to the sandbox instead, so in normal
// operation this only fires if code calls a live adapter directly.
//
// The message is user-facing ("coming soon"), never a dev/config detail. To
// wire the platform up for real, set its API credentials (see .env.example)
// or run with SOCIAL_SANDBOX=1 locally.
export class NotConfiguredError extends Error {
  constructor(platform) {
    super(`${platform} publishing is coming soon.`);
    this.name = 'NotConfiguredError';
    this.code = 'SOCIAL_NOT_CONFIGURED';
  }
}

// fetch + JSON with a uniform error shape, so a platform's own error body
// becomes a readable message instead of "[object Response]".
export async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error_description || body?.error || body?.raw || res.statusText;
    const err = new Error(`${res.status} ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const form = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
