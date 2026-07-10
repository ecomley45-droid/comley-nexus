// LinkedIn adapter — OAuth 2.0 + the Posts API. Posting as a member uses the
// w_member_social scope; posting as an organization page additionally needs
// the Community Management API access (requested from LinkedIn). This wiring
// covers the member/author happy path; organization-actor selection is a
// follow-up.
//
// Credentials: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET.

import { NotConfiguredError, httpJson, form } from './util.js';

const API = 'https://api.linkedin.com';
const clientId = () => process.env.LINKEDIN_CLIENT_ID;
const clientSecret = () => process.env.LINKEDIN_CLIENT_SECRET;

export function isConfigured() {
  return !!(clientId() && clientSecret());
}

const SCOPES = ['openid', 'profile', 'w_member_social'];

export function authUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new NotConfiguredError('LinkedIn');
  return `https://www.linkedin.com/oauth/v2/authorization?` + form({
    response_type: 'code', client_id: clientId(), redirect_uri: redirectUri,
    state, scope: SCOPES.join(' '),
  });
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new NotConfiguredError('LinkedIn');
  const tok = await httpJson(`${API}/oauth/v2/accessToken`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      client_id: clientId(), client_secret: clientSecret(),
    }),
  });
  // OpenID userinfo gives us the member's `sub` (their person URN id) + name.
  const me = await httpJson(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  return {
    externalId: `urn:li:person:${me.sub}`, handle: me.name || 'LinkedIn',
    accessToken: tok.access_token, refreshToken: tok.refresh_token || null,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    scopes: SCOPES.join(' '),
  };
}

export async function refresh({ account }) {
  if (!isConfigured()) throw new NotConfiguredError('LinkedIn');
  if (!account.refreshToken) throw new Error('No refresh token stored for this LinkedIn account — reconnect it.');
  const tok = await httpJson(`${API}/oauth/v2/accessToken`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ grant_type: 'refresh_token', refresh_token: account.refreshToken, client_id: clientId(), client_secret: clientSecret() }),
  });
  return {
    accessToken: tok.access_token, refreshToken: tok.refresh_token || account.refreshToken,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
  };
}

export async function publish({ account, text }) {
  if (!isConfigured()) throw new NotConfiguredError('LinkedIn');
  // Text share via the Posts API. Media (images/video) register as separate
  // asset uploads first — a follow-up once member vs org authoring is settled.
  const r = await fetch(`${API}/rest/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}`,
      'LinkedIn-Version': '202405', 'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: account.externalId,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
    }),
  });
  if (!r.ok) throw new Error(`LinkedIn publish failed: ${r.status} ${await r.text()}`);
  const id = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id');
  return { externalId: id, externalUrl: id ? `https://www.linkedin.com/feed/update/${id}` : null };
}

export async function fetchMetrics() {
  if (!isConfigured()) throw new NotConfiguredError('LinkedIn');
  // Member follower/impression stats require the organization + Community
  // Management access; until that's granted we return zeros rather than
  // failing the whole dashboard poll.
  return { followers: 0, impressions: 0, engagements: 0, posts: [] };
}

export default { platforms: ['li'], isConfigured, authUrl, exchangeCode, refresh, publish, fetchMetrics };
