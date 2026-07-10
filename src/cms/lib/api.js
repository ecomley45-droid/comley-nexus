// Fetch wrapper for the /api/* CMS routes in server.js. Sends the Clerk
// session JWT in Authorization: Bearer so the server can identify the
// user and enforce the role recorded in Clerk publicMetadata. Viewer
// identity (email/name/image) is not sent by the client any more — the
// server derives it from the verified Clerk user record.
import { getAuthToken } from './authToken.js';

const VIEWER_KEY = 'cms_viewer';

// Kept only as a client-side cache to render name/avatar in the UI without
// waiting on Clerk. Never trusted server-side — the server reads from Clerk.
export function getViewer() {
  try {
    return JSON.parse(localStorage.getItem(VIEWER_KEY)) || { email: '', name: '', image: null };
  } catch {
    return { email: '', name: '', image: null };
  }
}

export function setViewer(viewer) {
  localStorage.setItem(VIEWER_KEY, JSON.stringify(viewer));
}

// A paused workspace (Super Admin lifecycle control) makes the server
// return 423 for every org-scoped call. Set by PausedGate.jsx at the app
// root; request() calls it so any component's fetch can trigger the same
// full-page takeover without each caller wiring it up individually.
let pausedHandler = null;
export function setPausedHandler(fn) { pausedHandler = fn; }

async function request(path, options = {}) {
  const token = await getAuthToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;
  if (res.status === 423) {
    // Deliberately generic message on both ends -- never surfaces that the
    // real cause is a paused workspace. The page editor's Save flow passes
    // suppressPausedTakeover so an in-progress edit isn't yanked away by a
    // full-page overlay; every other caller gets the standard takeover.
    if (!options.suppressPausedTakeover) pausedHandler?.();
    throw new Error(data?.error || 'Something went wrong. Please contact support.');
  }
  if (!res.ok) throw new Error(data?.error || `Request to ${path} failed (${res.status})`);
  return data;
}

// ---- Identity / org (server-derived) ----
export const getMe = () => request('/me');

// ---- Custom domain (client request; live wiring is super-admin only) ----
export const requestCustomDomain = (domain) =>
  request('/org/custom-domain', { method: 'PATCH', body: JSON.stringify({ domain }) });

// ---- Orgs (super-admin) ----
export const listOrgs = () => request('/orgs');
export const createOrg = (payload) => request('/orgs', { method: 'POST', body: JSON.stringify(payload) });
export const getSiteTemplates = () => request('/site-templates');
export const createWorkspace = (payload) => request('/signup/workspace', { method: 'POST', body: JSON.stringify(payload) });

// ---- Built-in analytics ----
export const getSiteViews = (days = 30) => request(`/analytics/views?days=${days}`);

// ---- AI site generation ----
export const generateAiSite = (description) =>
  request('/ai/generate-site', { method: 'POST', body: JSON.stringify({ description }) });

// ---- Platform billing (Nexus's own plans) ----
export const getBillingStatus = () => request('/billing/status');
export const startCheckout = (plan, interval) =>
  request('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan, interval }) });
export const openBillingPortal = () => request('/billing/portal', { method: 'POST' });
export const updateOrg = (id, patch) => request(`/orgs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteOrg = (id) => request(`/orgs/${id}`, { method: 'DELETE' });
export const listOrgMembers = (id) => request(`/orgs/${id}/members`);
export const addOrgMember = (id, email, role) =>
  request(`/orgs/${id}/members`, { method: 'POST', body: JSON.stringify({ email, role }) });
export const removeOrgMember = (id, email) =>
  request(`/orgs/${id}/members/${encodeURIComponent(email)}`, { method: 'DELETE' });
export const getOrgUsage = (id) => request(`/orgs/${id}/usage`);

// ---- Super admin: jump into a workspace without a real org_members row ----
export const viewAsOrg = (orgId) => request(`/super-admin/view-as/${orgId}`, { method: 'POST' });
export const exitViewAs = () => request('/super-admin/view-as/clear', { method: 'POST' });

// ---- Pages ----
export const getPages = () => request('/pages');
// suppressPausedTakeover: a paused-workspace 423 here shows as a normal
// inline save error instead of yanking the editor away with a full-page
// takeover -- the in-progress edit stays visible even though it can't be
// saved elsewhere right now.
export const savePages = (pages, globalSettings) =>
  request('/pages', { method: 'POST', body: JSON.stringify({ pages, globalSettings }), suppressPausedTakeover: true });

export const getVersions = (pageId) => request(`/versions/${pageId}`);
export const restoreVersion = (pageId, versionId) =>
  request(`/versions/${pageId}/${versionId}/restore`, { method: 'POST' });

export const getAudit = () => request('/audit');

// ---- AI (paste-in block classification; 501s if ANTHROPIC_API_KEY isn't set) ----
export const classifyBlock = (html) => request('/ai/classify-block', { method: 'POST', body: JSON.stringify({ html }) });

// ---- Library ----
export const getLibrary = () => request('/library');
export const saveLibrary = (library) => request('/library', { method: 'POST', body: JSON.stringify(library) });

// ---- Nexus (super-admin only: the platform's own site, not any client org's) ----
export const getNexusPages = () => request('/nexus/pages');
export const saveNexusPages = (pages, globalSettings) =>
  request('/nexus/pages', { method: 'POST', body: JSON.stringify({ pages, globalSettings }) });
export const getNexusLibrary = () => request('/nexus/library');

// ---- Block catalog ("Add Block +") -- platform-wide entries plus (for a
// caller with a workspace) that workspace's own custom entries ----
export const getBlockCatalog = () => request('/block-catalog');
export const createBlockCatalogEntry = (payload) => request('/block-catalog', { method: 'POST', body: JSON.stringify(payload) });
export const updateBlockCatalogEntry = (id, patch) => request(`/block-catalog/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteBlockCatalogEntry = (id) => request(`/block-catalog/${id}`, { method: 'DELETE' });

// ---- Template marketplace ----
export const getTemplates = () => request('/templates');
export const getTemplate = (id) => request(`/templates/${id}`);
export const installTemplate = (id, applyTheme = true) =>
  request(`/templates/${id}/install`, { method: 'POST', body: JSON.stringify({ applyTheme }) });
export const getTemplateInstalls = () => request('/template-installs');
// Super-admin authoring
export const createTemplate = (payload) => request('/templates', { method: 'POST', body: JSON.stringify(payload) });
export const updateTemplate = (id, patch) => request(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTemplate = (id) => request(`/templates/${id}`, { method: 'DELETE' });
export const saveSiteAsTemplate = (payload) => request('/templates/from-site', { method: 'POST', body: JSON.stringify(payload) });

// ---- Site backups / restore ----
export const getBackups = () => request('/backups');
export const createBackup = (label) => request('/backups', { method: 'POST', body: JSON.stringify({ label }) });
export const restoreBackup = (id) => request(`/backups/${id}/restore`, { method: 'POST' });
export const deleteBackup = (id) => request(`/backups/${id}`, { method: 'DELETE' });

// ---- Central events (calendars + events) ----
export const getCalendars = () => request('/calendars');
export const createCalendar = (payload) => request('/calendars', { method: 'POST', body: JSON.stringify(payload) });
export const updateCalendar = (id, patch) => request(`/calendars/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteCalendar = (id) => request(`/calendars/${id}`, { method: 'DELETE' });
export const getEvents = (calendarId) => request(calendarId ? `/events?calendarId=${encodeURIComponent(calendarId)}` : '/events');
export const createEvent = (payload) => request('/events', { method: 'POST', body: JSON.stringify(payload) });
export const updateEvent = (id, patch) => request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteEvent = (id) => request(`/events/${id}`, { method: 'DELETE' });

// ---- Media ----
export const getMedia = () => request('/media');
export const uploadMedia = (name, mimeType, dataBase64, meta = {}) =>
  request('/media', { method: 'POST', body: JSON.stringify({ name, mimeType, dataBase64, ...meta }) });
export const updateMedia = (id, patch) =>
  request(`/media/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteMedia = (id) => request(`/media/${id}`, { method: 'DELETE' });

// ---- Redirects ----
export const getRedirects = () => request('/redirects');
export const addRedirect = (from, to, type) =>
  request('/redirects', { method: 'POST', body: JSON.stringify({ from, to, type }) });
export const deleteRedirect = (id) => request(`/redirects/${id}`, { method: 'DELETE' });

// ---- Comments ----
export const getComments = (pageId) => request(pageId ? `/comments?pageId=${pageId}` : '/comments');
export const addComment = (pageId, sectionId, text, author) =>
  request('/comments', { method: 'POST', body: JSON.stringify({ pageId, sectionId, text, author }) });
export const resolveComment = (id, resolved) =>
  request(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved }) });
export const deleteComment = (id) => request(`/comments/${id}`, { method: 'DELETE' });

// ---- A/B testing ----
export const getAbStats = (sectionId) => request(`/ab-stats/${sectionId}`);

// ---- Form submissions ----
export const getFormSubmissions = () => request('/forms');
export const markFormSubmission = (id, read = true) =>
  request(`/forms/${id}`, { method: 'PATCH', body: JSON.stringify({ read }) });
export const deleteFormSubmission = (id) => request(`/forms/${id}`, { method: 'DELETE' });

// ---- Draft previews (signed) ----
export const getPreviewToken = (pageId, nexus = false) =>
  request(nexus ? `/nexus/preview-token/${pageId}` : `/preview-token/${pageId}`);

// ---- Export ----
export const exportSite = () => request('/export', { method: 'POST' });

// ---- Team roster (reference list, not real permission enforcement) ----
export const getTeam = () => request('/team');
export const addTeamMember = (name, email, role) =>
  request('/team', { method: 'POST', body: JSON.stringify({ name, email, role }) });
export const removeTeamMember = (id) => request(`/team/${id}`, { method: 'DELETE' });

// ---- Feedback tickets (filed from FeedbackWidget.jsx) ----
export const getFeedback = () => request('/feedback');
export const submitFeedback = (payload) => request('/feedback', { method: 'POST', body: JSON.stringify(payload) });
export const updateFeedbackStatus = (id, status) =>
  request(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });

// ---- Ops: feedback assignments + system tagging ----
export const getAssignees = () => request('/feedback/assignees');
export const assignFeedback = (id, email) =>
  request(`/feedback/${id}/assignee`, { method: 'PATCH', body: JSON.stringify({ email }) });
export const tagFeedbackSystem = (id, systemId) =>
  request(`/feedback/${id}/system`, { method: 'PATCH', body: JSON.stringify({ system_id: systemId }) });

// ---- Ops: threaded comments (author-only edit/delete within 60s) ----
export const getFeedbackComments = (id) => request(`/feedback/${id}/comments`);
export const addFeedbackComment = (id, body) =>
  request(`/feedback/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
export const editFeedbackComment = (commentId, body) =>
  request(`/feedback/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ body }) });
export const deleteFeedbackComment = (commentId) =>
  request(`/feedback/comments/${commentId}`, { method: 'DELETE' });

// ---- Ops: systems (status board + feature-requests view) ----
export const getSystems = () => request('/systems');
export const getFeatureRequests = () => request('/systems/feature-requests');

// ---- Ops: dashboard aggregate + schedule roster ----
export const getOpsDashboard = () => request('/ops/dashboard');
export const getSchedule = () => request('/ops/schedule');

// ---- Ops: user preferences + personal stats ----
export const getPreferences = () => request('/user/preferences');
export const savePreferences = (patch) =>
  request('/user/preferences', { method: 'PATCH', body: JSON.stringify(patch) });

// ---- Integrations: API-key-based connections (Claude, ChatGPT) ----
// Google/GitHub/Slack are handled entirely client-side via Clerk's own
// account-linking (see ProfilePage.jsx) -- no server call for those.
export const getApiKeyStatus = () => request('/integrations/api-keys');
export const setApiKey = (provider, apiKey) =>
  request('/integrations/api-keys', { method: 'POST', body: JSON.stringify({ provider, apiKey }) });
export const removeApiKey = (provider) =>
  request(`/integrations/api-keys/${provider}`, { method: 'DELETE' });
export const getUserStats = (period = 'month') =>
  request(`/user/stats?period=${encodeURIComponent(period)}`);

// ---- Ops: git-pull tracker ----
export const getGitPulls = () => request('/git-pulls');
export const recordGitPull = (branchId) =>
  request('/git-pulls', { method: 'POST', body: JSON.stringify({ branch_id: branchId }) });

// ---- Social: accounts, dashboard, composer, scheduling ----
// The whole surface is gated by feature_flags.social (or SOCIAL_SANDBOX=1 in
// dev). window.location is used for OAuth start so the browser leaves for the
// platform's consent screen (or, in sandbox, loops back to our callback).
export const getSocialStatus = () => request('/social/status');
export const getSocialAccounts = () => request('/social/accounts');
export const startSocialConnect = async (platform) => {
  const { url } = await request(`/social/oauth/start?platform=${encodeURIComponent(platform)}`);
  window.location.href = url;
};
export const disconnectSocialAccount = (id) =>
  request(`/social/accounts/${id}`, { method: 'DELETE' });
export const getSocialDashboard = (days = 30) => request(`/social/dashboard?days=${days}`);
export const pollSocialMetrics = () => request('/social/poll', { method: 'POST' });
export const getSocialPlatforms = () => request('/social/platforms');
export const getSocialPosts = (status) =>
  request(`/social/posts${status ? `?status=${encodeURIComponent(status)}` : ''}`);
export const createSocialPost = (payload) =>
  request('/social/posts', { method: 'POST', body: JSON.stringify(payload) });
export const publishSocialPost = (id) =>
  request(`/social/posts/${id}/publish`, { method: 'POST' });
export const deleteSocialPost = (id) =>
  request(`/social/posts/${id}`, { method: 'DELETE' });

// ---- Newsletter / email builder (block editor + templates + AI + campaigns) ----
// A standard CMS feature ("Newsletter" in nav) — available to every workspace,
// not tied to Commerce. Sends sandbox until Resend is configured.
export const getEmailStatus = () => request('/email/status');
export const getEmailBlocks = () => request('/email/blocks');
export const previewEmail = (document) =>
  request('/email/preview', { method: 'POST', body: JSON.stringify({ document }) });
export const getEmailTemplates = () => request('/email/templates');
export const getEmailTemplate = (id) => request(`/email/templates/${id}`);
export const saveEmailTemplate = (payload) =>
  request('/email/templates', { method: 'POST', body: JSON.stringify(payload) });
export const deleteEmailTemplate = (id) =>
  request(`/email/templates/${id}`, { method: 'DELETE' });
export const aiGenerateEmail = (prompt) =>
  request('/email/ai/generate', { method: 'POST', body: JSON.stringify({ prompt }) });
export const aiEmailCopy = (brief, tone) =>
  request('/email/ai/copy', { method: 'POST', body: JSON.stringify({ brief, tone }) });
export const aiRestyleEmail = (document, theme) =>
  request('/email/ai/restyle', { method: 'POST', body: JSON.stringify({ document, theme }) });
export const getEmailCampaigns = () => request('/email/campaigns');
export const getEmailCampaign = (id) => request(`/email/campaigns/${id}`);
export const saveEmailCampaign = (payload) =>
  request('/email/campaigns', { method: 'POST', body: JSON.stringify(payload) });
export const deleteEmailCampaign = (id) =>
  request(`/email/campaigns/${id}`, { method: 'DELETE' });
export const previewAudienceCount = (audience) =>
  request('/email/audience/count', { method: 'POST', body: JSON.stringify({ audience }) });
export const sendEmailCampaign = (id) =>
  request(`/email/campaigns/${id}/send`, { method: 'POST' });
export const testEmailCampaign = (id, email) =>
  request(`/email/campaigns/${id}/test`, { method: 'POST', body: JSON.stringify({ email }) });
export const getEmailContact = (email) =>
  request(`/email/contacts/${encodeURIComponent(email)}`);

// ---- Staging → live (Deploy/Undeploy) + demo mode ----
export const getSiteStatus = () => request('/site/status');
export const deploySite = () => request('/site/deploy', { method: 'POST' });
export const undeploySite = () => request('/site/undeploy', { method: 'POST' });
export const updateSiteSettings = (patch) =>
  request('/site/settings', { method: 'PATCH', body: JSON.stringify(patch) });

// ---- Super admin: demo workspace ----
export const createDemoWorkspace = () =>
  request('/super-admin/demo-workspace', { method: 'POST', body: JSON.stringify({ reset: true }) });
