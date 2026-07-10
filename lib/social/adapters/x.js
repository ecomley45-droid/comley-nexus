// X (Twitter) adapter — API v2 with OAuth 2.0 PKCE. The code is the easy
// part here; the real cost is the paid API tier ($100+/mo Basic for
// meaningful write access) and low-tier rate + metric limits.
//
// Credentials: X_CLIENT_ID, X_CLIENT_SECRET (confidential client).
// PKCE verifier is round-tripped through the OAuth `state` we persist, so we
// don't need a server-side session store — see routes.js.

import { NotConfiguredError, httpJson, form } from './util.js';

const API = 'https://api.twitter.com/2';
const clientId = () => process.env.X_CLIENT_ID;
const clientSecret = () => process.env.X_CLIENT_SECRET;

export function isConfigured() {
  return !!(clientId() && clientSecret());
}

const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

// PKCE: the caller (routes.js) generates a verifier, passes us its S256
// challenge, and stashes the verifier alongside `state`. We keep it simple
// with the "plain" method's cousin — a real deployment should use S256; the
// challenge is provided by the caller either way.
export function authUrl({ redirectUri, state, codeChallenge }) {
  if (!isConfigured()) throw new NotConfiguredError('X');
  return `https://twitter.com/i/oauth2/authorize?` + form({
    response_type: 'code', client_id: clientId(), redirect_uri: redirectUri,
    scope: SCOPES.join(' '), state,
    code_challenge: codeChallenge || 'challenge', code_challenge_method: codeChallenge ? 'S256' : 'plain',
  });
}

const basicAuth = () => 'Basic ' + Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');

export async function exchangeCode({ code, redirectUri, codeVerifier }) {
  if (!isConfigured()) throw new NotConfiguredError('X');
  const tok = await httpJson(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier || 'challenge' }),
  });
  const me = await httpJson(`${API}/users/me?user.fields=username,public_metrics`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  return {
    externalId: me.data?.id, handle: me.data?.username ? `@${me.data.username}` : 'X',
    accessToken: tok.access_token, refreshToken: tok.refresh_token || null,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    scopes: SCOPES.join(' '),
  };
}

export async function refresh({ account }) {
  if (!isConfigured()) throw new NotConfiguredError('X');
  if (!account.refreshToken) throw new Error('No refresh token stored for this X account — reconnect it.');
  const tok = await httpJson(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: form({ grant_type: 'refresh_token', refresh_token: account.refreshToken }),
  });
  return {
    accessToken: tok.access_token, refreshToken: tok.refresh_token || account.refreshToken,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
  };
}

export async function publish({ account, text }) {
  if (!isConfigured()) throw new NotConfiguredError('X');
  // Media upload is a separate v1.1/v2 endpoint flow — text post here; media
  // support is a follow-up once the upload endpoint access is confirmed.
  const r = await httpJson(`${API}/tweets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` },
    body: JSON.stringify({ text }),
  });
  const id = r.data?.id;
  return { externalId: id, externalUrl: id ? `https://x.com/${account.handle?.replace(/^@/, '')}/status/${id}` : null };
}

export async function fetchMetrics({ account }) {
  if (!isConfigured()) throw new NotConfiguredError('X');
  const me = await httpJson(`${API}/users/${account.externalId}?user.fields=public_metrics`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  const pm = me.data?.public_metrics || {};
  // Impressions/engagements need the (gated) tweet metrics endpoints; on low
  // tiers we surface followers and leave the rest at 0 rather than error.
  return { followers: pm.followers_count || 0, impressions: 0, engagements: 0, posts: [] };
}

export default { platforms: ['x'], isConfigured, authUrl, exchangeCode, refresh, publish, fetchMetrics };
