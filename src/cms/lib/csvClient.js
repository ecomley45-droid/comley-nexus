import { commerceAuthHeaders } from '../../commerce/lib/api.js';
import { getAuthToken } from './authToken.js';

const cmsHeaders = async () => {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Commerce admin routes also authenticate via the CMS role (Bearer token);
// the X-User-Role headers are only honored in local dev.
const headersFor = async (scope) => {
  const base = await cmsHeaders();
  return scope === 'commerce' ? { ...base, ...commerceAuthHeaders } : base;
};

// GET /api/export/csv/:type routes require the same auth headers as any
// other admin route, which a plain <a href> navigation can't send — so
// exports go through fetch()+blob instead of a direct link.
async function download(pathname, headers, filename) {
  const res = await fetch(pathname, { headers });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function upload(pathname, headers, csvText) {
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ csv: csvText }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
  return data;
}

export async function exportCsv(scope, type, filename) {
  const base = scope === 'commerce' ? `/api/commerce/export/csv/${type}` : `/api/export/csv/${type}`;
  return download(base, await headersFor(scope), filename);
}

export async function downloadTemplate(scope, type, filename) {
  const base = scope === 'commerce' ? `/api/commerce/export/csv/${type}/template` : `/api/export/csv/${type}/template`;
  return download(base, await headersFor(scope), filename);
}

export async function importCsv(scope, type, csvText) {
  const base = scope === 'commerce' ? `/api/commerce/import/csv/${type}` : `/api/import/csv/${type}`;
  return upload(base, await headersFor(scope), csvText);
}
