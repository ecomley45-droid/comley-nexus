// Meta adapter — serves both Instagram (ig) and Facebook (fb), since both
// ride the same Graph API and a single Facebook Login authorizes both. One
// app registration + review unlocks the pair, which is why the roadmap
// onboards Meta first.
//
// Credentials: META_APP_ID, META_APP_SECRET. Publishing needs App Review
// for pages_manage_posts + instagram_content_publish and business
// verification; until those clear, the connect flow can still complete with
// lower scopes but publish() will 403 from Meta.
//
// This is real wiring at the single-page/single-IG-account happy path. The
// page-picker UX (when a user manages several Pages) is a follow-up: today
// exchangeCode() takes the first Page and its linked IG account.

import { NotConfiguredError, httpJson, form } from './util.js';
import { platformLabel } from '../platforms.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const appId = () => process.env.META_APP_ID;
const appSecret = () => process.env.META_APP_SECRET;

export function isConfigured() {
  return !!(appId() && appSecret());
}

const SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
  'read_insights', 'instagram_basic', 'instagram_content_publish',
  'instagram_manage_insights', 'business_management',
];

export function authUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new NotConfiguredError('Meta');
  return `https://www.facebook.com/v21.0/dialog/oauth?` + form({
    client_id: appId(), redirect_uri: redirectUri, state,
    scope: SCOPES.join(','), response_type: 'code',
  });
}

export async function exchangeCode({ platform, code, redirectUri }) {
  if (!isConfigured()) throw new NotConfiguredError('Meta');
  // 1. code -> short-lived user token
  const short = await httpJson(`${GRAPH}/oauth/access_token?` + form({
    client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri, code,
  }));
  // 2. short-lived -> long-lived user token (~60d)
  const long = await httpJson(`${GRAPH}/oauth/access_token?` + form({
    grant_type: 'fb_exchange_token', client_id: appId(),
    client_secret: appSecret(), fb_exchange_token: short.access_token,
  }));
  const userToken = long.access_token;
  // 3. first managed Page + its own (non-expiring) Page token
  const pages = await httpJson(`${GRAPH}/me/accounts?` + form({ access_token: userToken, fields: 'id,name,access_token,instagram_business_account' }));
  const page = pages.data?.[0];
  if (!page) throw new Error('No Facebook Page found on this account — a Page is required to post.');

  if (platform === 'fb') {
    return {
      externalId: page.id, handle: page.name,
      accessToken: page.access_token, refreshToken: null,
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
      scopes: SCOPES.join(','),
    };
  }
  // Instagram: the Business account linked to that Page.
  const igId = page.instagram_business_account?.id;
  if (!igId) throw new Error('No Instagram Business account is linked to this Page. Link one in Meta settings, then reconnect.');
  const ig = await httpJson(`${GRAPH}/${igId}?` + form({ access_token: page.access_token, fields: 'username' }));
  return {
    externalId: igId, handle: ig.username ? `@${ig.username}` : 'Instagram',
    accessToken: page.access_token, refreshToken: null,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
    scopes: SCOPES.join(','),
  };
}

// Meta long-lived tokens are re-exchanged, not refresh-token'd.
export async function refresh({ account }) {
  if (!isConfigured()) throw new NotConfiguredError('Meta');
  const long = await httpJson(`${GRAPH}/oauth/access_token?` + form({
    grant_type: 'fb_exchange_token', client_id: appId(),
    client_secret: appSecret(), fb_exchange_token: account.accessToken,
  }));
  return {
    accessToken: long.access_token, refreshToken: null,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
  };
}

export async function publish({ account, text, media = [] }) {
  if (!isConfigured()) throw new NotConfiguredError('Meta');
  const token = account.accessToken;
  if (account.platform === 'fb') {
    // Text/link post, or a photo when media is present.
    if (media[0]?.url) {
      const r = await httpJson(`${GRAPH}/${account.externalId}/photos`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ url: media[0].url, caption: text, access_token: token }),
      });
      return { externalId: r.post_id || r.id, externalUrl: null };
    }
    const r = await httpJson(`${GRAPH}/${account.externalId}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ message: text, access_token: token }),
    });
    return { externalId: r.id, externalUrl: null };
  }
  // Instagram: two-step — create a media container, then publish it.
  if (!media[0]?.url) throw new Error('Instagram posts require an image or video.');
  const container = await httpJson(`${GRAPH}/${account.externalId}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ image_url: media[0].url, caption: text, access_token: token }),
  });
  const published = await httpJson(`${GRAPH}/${account.externalId}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ creation_id: container.id, access_token: token }),
  });
  return { externalId: published.id, externalUrl: null };
}

export async function fetchMetrics({ account }) {
  if (!isConfigured()) throw new NotConfiguredError('Meta');
  const token = account.accessToken;
  try {
    if (account.platform === 'fb') {
      const page = await httpJson(`${GRAPH}/${account.externalId}?` + form({ fields: 'fan_count', access_token: token }));
      const ins = await httpJson(`${GRAPH}/${account.externalId}/insights?` + form({ metric: 'page_impressions,page_post_engagements', period: 'day', access_token: token }));
      const val = (name) => ins.data?.find((d) => d.name === name)?.values?.slice(-1)[0]?.value || 0;
      return { followers: page.fan_count || 0, impressions: val('page_impressions'), engagements: val('page_post_engagements'), posts: [] };
    }
    const ig = await httpJson(`${GRAPH}/${account.externalId}?` + form({ fields: 'followers_count', access_token: token }));
    const ins = await httpJson(`${GRAPH}/${account.externalId}/insights?` + form({ metric: 'impressions,reach', period: 'day', access_token: token }));
    const val = (name) => ins.data?.find((d) => d.name === name)?.values?.slice(-1)[0]?.value || 0;
    return { followers: ig.followers_count || 0, impressions: val('impressions'), engagements: val('reach'), posts: [] };
  } catch (e) {
    throw new Error(`${platformLabel(account.platform)} metrics failed: ${e.message}`);
  }
}

// Recent posts for the Feed block. IG returns media with a permalink +
// image; FB returns recent Page posts.
export async function fetchFeed({ account, limit = 6 }) {
  if (!isConfigured()) throw new NotConfiguredError('Meta');
  const token = account.accessToken;
  if (account.platform === 'ig') {
    const r = await httpJson(`${GRAPH}/${account.externalId}/media?` + form({
      fields: 'caption,media_url,permalink,timestamp,media_type', limit, access_token: token,
    }));
    return (r.data || []).filter((m) => m.media_type !== 'VIDEO' || m.media_url).map((m) => ({
      externalId: m.id, text: m.caption || '', image: m.media_url || null,
      url: m.permalink || null, postedAt: m.timestamp || null,
    }));
  }
  const r = await httpJson(`${GRAPH}/${account.externalId}/posts?` + form({
    fields: 'message,permalink_url,created_time,full_picture', limit, access_token: token,
  }));
  return (r.data || []).map((p) => ({
    externalId: p.id, text: p.message || '', image: p.full_picture || null,
    url: p.permalink_url || null, postedAt: p.created_time || null,
  }));
}

export default { platforms: ['ig', 'fb'], isConfigured, authUrl, exchangeCode, refresh, publish, fetchMetrics, fetchFeed };
