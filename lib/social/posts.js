// social_posts + social_post_targets repo. A post carries the shared body +
// media; each target row is one platform the post fans out to, with an
// optional per-network override and its own publish status. Reads stitch the
// two together into one object for the API.

import crypto from 'crypto';
import { db } from '../db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[social/posts/${msg}] ${error.message}`);
};

const POST_COLS = 'id, org_id, body, media, status, scheduled_at, created_by, created_at, updated_at';
const TARGET_COLS = 'post_id, account_id, status, override_body, override_media, external_id, external_url, error, attempts, sent_at';

function postToApi(p, targets) {
  return {
    id: p.id,
    body: p.body,
    media: p.media || [],
    status: p.status,
    scheduledAt: p.scheduled_at,
    createdBy: p.created_by,
    createdAt: p.created_at,
    targets: (targets || []).map(targetToApi),
  };
}

function targetToApi(t) {
  return {
    accountId: t.account_id,
    status: t.status,
    overrideBody: t.override_body,
    overrideMedia: t.override_media,
    externalId: t.external_id,
    externalUrl: t.external_url,
    error: t.error,
    attempts: t.attempts,
    sentAt: t.sent_at,
  };
}

// Effective text/media for one target: its override wins, else the post's
// shared values. Shared by the composer preview and the publish fan-out.
export function effectiveContent(post, target) {
  return {
    text: target.overrideBody != null ? target.overrideBody : post.body,
    media: target.overrideMedia != null ? target.overrideMedia : (post.media || []),
  };
}

export async function create(orgId, { body, media, status, scheduledAt, createdBy, targets }) {
  const id = `spost_${crypto.randomBytes(8).toString('hex')}`;
  const { error: pErr } = await db().from('social_posts').insert({
    id, org_id: orgId,
    body: body || '', media: media || [],
    status: status || 'draft',
    scheduled_at: scheduledAt || null,
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  });
  throwOn('create', pErr);

  if (targets?.length) {
    const rows = targets.map((t) => ({
      post_id: id, account_id: t.accountId,
      status: 'queued',
      override_body: t.overrideBody ?? null,
      override_media: t.overrideMedia ?? null,
    }));
    const { error: tErr } = await db().from('social_post_targets').insert(rows);
    throwOn('create.targets', tErr);
  }
  return get(orgId, id);
}

export async function get(orgId, id) {
  const { data: p, error } = await db().from('social_posts')
    .select(POST_COLS).eq('org_id', orgId).eq('id', id).maybeSingle();
  throwOn('get', error);
  if (!p) return null;
  const { data: targets, error: tErr } = await db().from('social_post_targets')
    .select(TARGET_COLS).eq('post_id', id);
  throwOn('get.targets', tErr);
  return postToApi(p, targets);
}

export async function list(orgId, { status, limit = 100 } = {}) {
  let q = db().from('social_posts').select(POST_COLS).eq('org_id', orgId);
  if (status) q = q.eq('status', status);
  const { data: posts, error } = await q.order('created_at', { ascending: false }).limit(limit);
  throwOn('list', error);
  if (!posts?.length) return [];
  const ids = posts.map((p) => p.id);
  const { data: targets, error: tErr } = await db().from('social_post_targets').select(TARGET_COLS).in('post_id', ids);
  throwOn('list.targets', tErr);
  const byPost = {};
  for (const t of targets || []) (byPost[t.post_id] ||= []).push(t);
  return posts.map((p) => postToApi(p, byPost[p.id]));
}

export async function setStatus(id, status) {
  const { error } = await db().from('social_posts')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  throwOn('setStatus', error);
}

export async function setTargetResult(postId, accountId, { status, externalId, externalUrl, error, incAttempt }) {
  const patch = { status };
  if (externalId !== undefined) patch.external_id = externalId;
  if (externalUrl !== undefined) patch.external_url = externalUrl;
  if (error !== undefined) patch.error = error;
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (incAttempt) {
    // attempts = attempts + 1 without a round trip isn't expressible in
    // PostgREST; read-modify-write is fine at this cardinality.
    const { data } = await db().from('social_post_targets')
      .select('attempts').eq('post_id', postId).eq('account_id', accountId).maybeSingle();
    patch.attempts = (data?.attempts || 0) + 1;
  }
  const { error: uErr } = await db().from('social_post_targets')
    .update(patch).eq('post_id', postId).eq('account_id', accountId);
  throwOn('setTargetResult', uErr);
}

export async function remove(orgId, id) {
  const { error } = await db().from('social_posts').delete().eq('org_id', orgId).eq('id', id);
  throwOn('remove', error);
}

// Cross-org lookup of which org a post belongs to — the single-post cron
// (QStash target) has only the post id, not an org context.
export async function findOrg(postId) {
  const { data, error } = await db().from('social_posts')
    .select('org_id').eq('id', postId).maybeSingle();
  throwOn('findOrg', error);
  return data?.org_id || null;
}

// Scheduled posts whose time has arrived — the publish-due cron's work list.
// Cross-org by design (the cron runs platform-wide), so it returns org_id.
export async function listDue(nowIso = new Date().toISOString(), limit = 50) {
  const { data, error } = await db().from('social_posts')
    .select('id, org_id').eq('status', 'scheduled').lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true }).limit(limit);
  throwOn('listDue', error);
  return data || [];
}
