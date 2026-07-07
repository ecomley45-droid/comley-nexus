// One-time (idempotent) setup: creates the Nexus Starter/Pro/Agency
// products and their monthly/annual prices in Stripe, found by lookup_key
// so re-runs never duplicate. Requires STRIPE_SECRET_KEY in .env.local.
//
// Usage: node scripts/setupStripePlans.mjs

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { ensurePlans } = await import('../lib/billing.js');

const created = await ensurePlans();
console.log('Stripe plans ready:');
for (const p of created) {
  console.log(`  ${p.lookupKey.padEnd(24)} ${p.priceId}`);
}
