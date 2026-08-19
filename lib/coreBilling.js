// Dual-write of this app's subscription state into nexus-core's
// billing_accounts table (nexus-core/packages/core/db/schema.sql), so
// Nexus Command's read-only billing status view
// (nexus-core/apps/command's GET /api/billing/status/:orgId) reflects CMS
// orgs correctly. CMS's own /api/billing/* routes (lib/billing.js) remain
// the real, live billing path for this app -- this is purely an additive
// mirror of that state into Core, not a replacement.
//
// Mirrors @comley/nexus-core's upsertBillingAccount
// (nexus-core/packages/core/src/index.js) inline rather than as a package
// dependency -- same "deploys independently, can't depend on a sibling
// local repo" reasoning as lib/coreFlags.js, which does the same for
// feature flags against the same Core project.
//
// Best-effort: a failure here is logged, never thrown -- CMS's own
// subscription handling (orgs.feature_flags.subscription, the actual
// source CMS reads from) must never fail or roll back because Core's
// project is unreachable.
import { createClient } from '@supabase/supabase-js';

const coreUrl = process.env.CORE_SUPABASE_URL;
const coreKey = process.env.CORE_SUPABASE_SERVICE_ROLE_KEY;
const core = coreUrl && coreKey ? createClient(coreUrl, coreKey) : null;
if (!core) console.warn('[coreBilling] CORE_SUPABASE_URL/CORE_SUPABASE_SERVICE_ROLE_KEY not set — billing_accounts dual-write is disabled.');

export async function mirrorBillingAccountToCore(orgId, patch) {
  if (!core) return;
  try {
    const columns = { org_id: orgId, updated_at: new Date().toISOString() };
    for (const key of ['stripe_customer_id', 'stripe_subscription_id', 'plan', 'status', 'current_period_end']) {
      if (patch[key] !== undefined) columns[key] = patch[key];
    }
    const { error } = await core.from('billing_accounts').upsert(columns, { onConflict: 'org_id' });
    if (error) throw error;
  } catch (e) {
    console.error('[coreBilling] mirrorBillingAccountToCore failed (non-fatal):', e.message);
  }
}
