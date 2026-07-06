// Outbound email via Resend (already a dependency for commerce receipts).
// Sending is best-effort and optional: without RESEND_API_KEY +
// RESEND_FROM configured, callers proceed silently -- a missing email
// integration must never make a form submission fail, since the
// submission itself is already stored.

import { Resend } from 'resend';

let client = null;
function resend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export async function sendFormNotification({ to, orgName, formName, pagePath, fields }) {
  const r = resend();
  const from = process.env.RESEND_FROM;
  if (!r || !from || !to?.length) return false;

  const rows = Object.entries(fields || {})
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`)
    .join('');

  try {
    await r.emails.send({
      from,
      to,
      subject: `New ${formName} submission — ${orgName}`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#222">
<p><strong>${esc(formName)}</strong> on ${esc(orgName)}${pagePath ? ` (/${esc(pagePath)})` : ''}:</p>
<table>${rows}</table>
<p style="color:#999;font-size:12px;margin-top:16px">View all submissions in your Nexus Forms inbox.</p>
</div>`,
    });
    return true;
  } catch {
    return false; // best-effort, submission is already stored
  }
}
