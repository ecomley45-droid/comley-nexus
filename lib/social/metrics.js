// social_metrics repo — daily snapshots per account, same shape as
// page_views. The poller upserts one account-level row per account per day
// (post_external_id = ''); the dashboard reads a date range and aggregates.

import { db } from '../db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[social/metrics/${msg}] ${error.message}`);
};

// Upsert today's (or a given day's) account-level snapshot. Idempotent on
// (account_id, day, '') so re-polling the same day overwrites rather than
// duplicating.
export async function record(accountId, { followers, impressions, engagements, day, postExternalId = '' }) {
  const row = {
    account_id: accountId,
    day: day || new Date().toISOString().slice(0, 10),
    post_external_id: postExternalId,
    followers: followers ?? null,
    impressions: impressions ?? 0,
    engagements: engagements ?? 0,
    captured_at: new Date().toISOString(),
  };
  const { error } = await db().from('social_metrics')
    .upsert(row, { onConflict: 'account_id,day,post_external_id' });
  throwOn('record', error);
}

// All account-level rows for a set of accounts over the last `days` days.
export async function listForAccounts(accountIds, days = 30) {
  if (!accountIds.length) return [];
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await db().from('social_metrics')
    .select('account_id, day, followers, impressions, engagements')
    .in('account_id', accountIds)
    .eq('post_external_id', '')
    .gte('day', since)
    .order('day', { ascending: true });
  throwOn('listForAccounts', error);
  return data || [];
}
