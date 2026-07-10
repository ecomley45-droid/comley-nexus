// email_campaigns repo + engagement/suppression helpers.

import { db } from '../db.js';
import { uid } from './blocks.js';

const throwOn = (msg, error) => { if (error) throw new Error(`[email/campaigns/${msg}] ${error.message}`); };
const COLS = 'id, org_id, name, subject, preheader, document, audience, status, scheduled_at, sent_at, stats, created_by, created_at, updated_at';

const toApi = (r) => ({
  id: r.id, name: r.name, subject: r.subject, preheader: r.preheader,
  document: r.document || {}, audience: r.audience || {}, status: r.status,
  scheduledAt: r.scheduled_at, sentAt: r.sent_at, stats: r.stats || {},
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function list(orgId) {
  const { data, error } = await db().from('email_campaigns').select(COLS)
    .eq('org_id', orgId).order('created_at', { ascending: false }).limit(200);
  throwOn('list', error);
  return (data || []).map(toApi);
}

export async function get(orgId, id) {
  const { data, error } = await db().from('email_campaigns').select(COLS)
    .eq('org_id', orgId).eq('id', id).maybeSingle();
  throwOn('get', error);
  return data ? toApi(data) : null;
}

export async function save(orgId, patch) {
  const row = {
    id: patch.id || uid('camp'), org_id: orgId,
    name: patch.name ?? 'Untitled campaign', subject: patch.subject ?? '',
    preheader: patch.preheader ?? '', document: patch.document ?? {},
    audience: patch.audience ?? {}, status: patch.status ?? 'draft',
    scheduled_at: patch.scheduledAt ?? null, updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from('email_campaigns')
    .upsert(row, { onConflict: 'id' }).select(COLS).maybeSingle();
  throwOn('save', error);
  return toApi(data);
}

export async function setStatus(id, status, extra = {}) {
  const patch = { status, updated_at: new Date().toISOString(), ...extra };
  const { error } = await db().from('email_campaigns').update(patch).eq('id', id);
  throwOn('setStatus', error);
}

export async function remove(orgId, id) {
  const { error } = await db().from('email_campaigns').delete().eq('org_id', orgId).eq('id', id);
  throwOn('remove', error);
}

// Scheduled campaigns whose time has arrived — the send-due cron's work list.
export async function listDue(nowIso = new Date().toISOString()) {
  const { data, error } = await db().from('email_campaigns')
    .select('id, org_id').eq('status', 'scheduled').lte('scheduled_at', nowIso).limit(20);
  throwOn('listDue', error);
  return data || [];
}

// ---- Engagement events ----
export async function recordEvent(orgId, { campaignId, contactEmail, type, url }) {
  const { error } = await db().from('email_events').insert({
    id: uid('evt'), org_id: orgId, campaign_id: campaignId,
    contact_email: contactEmail, type, url: url || null,
  });
  throwOn('recordEvent', error);
}

export async function eventsForCampaign(campaignId) {
  const { data, error } = await db().from('email_events')
    .select('type, contact_email, url, at').eq('campaign_id', campaignId);
  throwOn('eventsForCampaign', error);
  return data || [];
}

export async function eventsForContact(orgId, email, limit = 100) {
  const { data, error } = await db().from('email_events')
    .select('campaign_id, type, url, at').eq('org_id', orgId).eq('contact_email', email)
    .order('at', { ascending: false }).limit(limit);
  throwOn('eventsForContact', error);
  return data || [];
}

// ---- Suppression ----
export async function suppress(orgId, email, reason = 'unsubscribe') {
  const { error } = await db().from('email_suppressions')
    .upsert({ org_id: orgId, contact_email: email, reason }, { onConflict: 'org_id,contact_email' });
  throwOn('suppress', error);
}

export async function suppressedSet(orgId) {
  const { data, error } = await db().from('email_suppressions').select('contact_email').eq('org_id', orgId);
  throwOn('suppressedSet', error);
  return new Set((data || []).map((r) => r.contact_email));
}
