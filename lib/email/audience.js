// Resolve a campaign's audience from the workspace's EXISTING contacts — no
// separate contacts table (per the product decision). Two sources:
//
//   • newsletter — emails captured by Newsletter/Contact form blocks. These
//     live in form_submissions, which IS org-scoped, so this is always safe.
//   • customers  — commerce customers. NOTE: the commerce `customers` table
//     is single-tenant (no org_id) in this codebase, so it's an explicit
//     opt-in source, not a default, to avoid ever mailing one workspace's
//     campaign to another's buyers. Revisit if commerce becomes multi-tenant.
//
// Always minus the org's suppression list (unsubscribes / hard bounces).

import { db } from '../db.js';
import * as customersRepo from '../commerce/customersRepo.js';
import { suppressedSet } from './campaigns.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pull any email-looking value out of a form submission's fields.
function emailFromFields(fields) {
  if (!fields || typeof fields !== 'object') return null;
  const direct = fields.email || fields.Email || fields.EMAIL;
  if (typeof direct === 'string' && EMAIL_RE.test(direct)) return direct.toLowerCase();
  for (const v of Object.values(fields)) {
    if (typeof v === 'string' && EMAIL_RE.test(v)) return v.toLowerCase();
  }
  return null;
}

async function newsletterEmails(orgId) {
  const { data, error } = await db().from('form_submissions')
    .select('fields').eq('org_id', orgId).limit(5000);
  if (error) throw new Error(`[email/audience/newsletter] ${error.message}`);
  const out = new Set();
  for (const r of data || []) { const e = emailFromFields(r.fields); if (e) out.add(e); }
  return out;
}

async function customerEmails() {
  const customers = await customersRepo.listCustomers();
  const out = new Set();
  for (const c of customers || []) { if (c.email && EMAIL_RE.test(c.email)) out.add(c.email.toLowerCase()); }
  return out;
}

// Resolve to a deduped, suppression-filtered array of lowercased emails.
export async function resolve(orgId, spec = {}) {
  const sources = Array.isArray(spec.sources) && spec.sources.length ? spec.sources : ['newsletter'];
  const emails = new Set();
  if (sources.includes('newsletter')) for (const e of await newsletterEmails(orgId)) emails.add(e);
  if (sources.includes('customers')) for (const e of await customerEmails()) emails.add(e);

  const suppressed = await suppressedSet(orgId);
  return [...emails].filter((e) => !suppressed.has(e));
}

// Cheap count for the composer's audience step.
export async function count(orgId, spec) {
  return (await resolve(orgId, spec)).length;
}
