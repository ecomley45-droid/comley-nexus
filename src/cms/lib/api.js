// Fetch wrapper for the /api/* CMS routes in server.js. Mirrors the pattern
// already used by src/commerce/lib/api.js. Sends the simulated X-User-Role
// header the backend's requireRole() middleware expects (see server.js —
// there's no real auth here, it's a trust-based role gate by design).
const ROLE_KEY = 'cms_role';

export function getRole() {
  return localStorage.getItem(ROLE_KEY) || 'admin';
}

export function setRole(role) {
  localStorage.setItem(ROLE_KEY, role);
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Role': getRole(),
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
