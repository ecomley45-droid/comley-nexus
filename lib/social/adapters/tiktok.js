// TikTok adapter — OAuth 2.0 + the Content Posting API. The most gated of
// the five: unaudited apps can only create private/draft posts, and direct
// public publishing requires passing TikTok's app audit. TikTok is also
// video-only, so publish() expects a video URL in media.
//
// Credentials: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET.

import { NotConfiguredError, httpJson, form } from './util.js';

const OPEN = 'https://open.tiktokapis.com/v2';
const clientKey = () => process.env.TIKTOK_CLIENT_KEY;
const clientSecret = () => process.env.TIKTOK_CLIENT_SECRET;

export function isConfigured() {
  return !!(clientKey() && clientSecret());
}

const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

export function authUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new NotConfiguredError('TikTok');
  return `https://www.tiktok.com/v2/auth/authorize/?` + form({
    client_key: clientKey(), response_type: 'code', scope: SCOPES.join(','),
    redirect_uri: redirectUri, state,
  });
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new NotConfiguredError('TikTok');
  const tok = await httpJson(`${OPEN}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_key: clientKey(), client_secret: clientSecret(), code,
      grant_type: 'authorization_code', redirect_uri: redirectUri,
    }),
  });
  const me = await httpJson(`${OPEN}/user/info/?fields=open_id,username,follower_count`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  return {
    externalId: tok.open_id || me.data?.user?.open_id, handle: me.data?.user?.username ? `@${me.data.user.username}` : 'TikTok',
    accessToken: tok.access_token, refreshToken: tok.refresh_token || null,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    scopes: SCOPES.join(','),
  };
}

export async function refresh({ account }) {
  if (!isConfigured()) throw new NotConfiguredError('TikTok');
  if (!account.refreshToken) throw new Error('No refresh token stored for this TikTok account — reconnect it.');
  const tok = await httpJson(`${OPEN}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_key: clientKey(), client_secret: clientSecret(), grant_type: 'refresh_token', refresh_token: account.refreshToken }),
  });
  return {
    accessToken: tok.access_token, refreshToken: tok.refresh_token || account.refreshToken,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
  };
}

export async function publish({ account, text, media = [] }) {
  if (!isConfigured()) throw new NotConfiguredError('TikTok');
  if (!media[0]?.url) throw new Error('TikTok posts require a video.');
  // PULL_FROM_URL init. Unaudited apps land as private drafts; audited apps
  // with video.publish can post publicly.
  const r = await httpJson(`${OPEN}/post/publish/video/init/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` },
    body: JSON.stringify({
      post_info: { title: text?.slice(0, 150) || '', privacy_level: 'SELF_ONLY' },
      source_info: { source: 'PULL_FROM_URL', video_url: media[0].url },
    }),
  });
  return { externalId: r.data?.publish_id, externalUrl: null };
}

export async function fetchMetrics({ account }) {
  if (!isConfigured()) throw new NotConfiguredError('TikTok');
  const me = await httpJson(`${OPEN}/user/info/?fields=follower_count,likes_count`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  const u = me.data?.user || {};
  return { followers: u.follower_count || 0, impressions: 0, engagements: u.likes_count || 0, posts: [] };
}

export default { platforms: ['tt'], isConfigured, authUrl, exchangeCode, refresh, publish, fetchMetrics };
