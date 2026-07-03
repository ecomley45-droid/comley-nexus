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
  if (!res.ok) throw new Error(data?.error || `Request to ${path} failed (${res.status})`);
  return data;
}

// ---- Pages ----
export const getPages = () => request('/pages');
export const savePages = (pages, globalSettings) =>
  request('/pages', { method: 'POST', body: JSON.stringify({ pages, globalSettings }) });

export const getVersions = (pageId) => request(`/versions/${pageId}`);
export const restoreVersion = (pageId, versionId) =>
  request(`/versions/${pageId}/${versionId}/restore`, { method: 'POST' });

export const getAudit = () => request('/audit');

// ---- Library ----
export const getLibrary = () => request('/library');
export const saveLibrary = (library) => request('/library', { method: 'POST', body: JSON.stringify(library) });

// ---- Media ----
export const getMedia = () => request('/media');
export const uploadMedia = (name, mimeType, dataBase64) =>
  request('/media', { method: 'POST', body: JSON.stringify({ name, mimeType, dataBase64 }) });
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
export const getUserStats = (period = 'month') =>
  request(`/user/stats?period=${encodeURIComponent(period)}`);

// ---- Ops: git-pull tracker ----
export const getGitPulls = () => request('/git-pulls');
export const recordGitPull = (branchId) =>
  request('/git-pulls', { method: 'POST', body: JSON.stringify({ branch_id: branchId }) });
