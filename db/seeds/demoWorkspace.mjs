// Create (or reset) the fully-populated demo workspace from the CLI.
//
//   node db/seeds/demoWorkspace.mjs                # owner = first ADMIN_EMAILS
//   node db/seeds/demoWorkspace.mjs you@example.com
//
// Idempotent: wipes the existing 'demo' org first, then rebuilds it (pages,
// media, forms, ~30 days of analytics, a newsletter, and a live deployment).
// Needs the same SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY the server uses.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { seedDemoWorkspace } = await import('../../lib/demoSeed.js');

const ownerEmail = process.argv[2] || (process.env.ADMIN_EMAILS || '').split(',')[0].trim() || null;
if (!ownerEmail) {
  console.warn('[demo] No owner email given and ADMIN_EMAILS is empty — the workspace will have no member. Pass one as an argument to be able to open it.');
}

console.log('[demo] Seeding demo workspace…');
const result = await seedDemoWorkspace({ ownerEmail, reset: true });
console.log(`[demo] Done — org "${result.orgId}" with ${result.pages} pages, deployed live.`);
process.exit(0);
