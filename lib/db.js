// Supabase-JS singleton for server-side use. Uses the service_role key,
// which bypasses RLS — never send this to a browser.
//
// Consumers (lib/storage.js, lib/ops/routes.js) import { db } and call
// db.from('pages').select(...) directly. No raw SQL escapes; everything
// runs over PostgREST/HTTPS which works from Vercel serverless.

import { createClient } from '@supabase/supabase-js';

let cached = null;
let testOverride = null;

// Test seam: swap in a stand-in client so the storage layer can be exercised
// without a database (see test/pageConcurrency.test.js). Pass null to
// restore. Never called from application code.
export function setDbClientForTests(client) {
  testOverride = client;
}

export function db() {
  if (testOverride) return testOverride;
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is required');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
  return cached;
}
