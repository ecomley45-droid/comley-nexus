import { getRole } from './api.js';
import { commerceAuthHeaders } from '../../commerce/lib/api.js';

const cmsHeaders = () => ({ 'X-User-Role': getRole() });

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

export function exportCsv(scope, type, filename) {
  const base = scope === 'commerce' ? `/api/commerce/export/csv/${type}` : `/api/export/csv/${type}`;
  return download(base, scope === 'commerce' ? commerceAuthHeaders : cmsHeaders(), filename);
}

export function downloadTemplate(scope, type, filename) {
  const base = scope === 'commerce' ? `/api/commerce/export/csv/${type}/template` : `/api/export/csv/${type}/template`;
  return download(base, scope === 'commerce' ? commerceAuthHeaders : cmsHeaders(), filename);
}

export function importCsv(scope, type, csvText) {
  const base = scope === 'commerce' ? `/api/commerce/import/csv/${type}` : `/api/import/csv/${type}`;
  return upload(base, scope === 'commerce' ? commerceAuthHeaders : cmsHeaders(), csvText);
}
