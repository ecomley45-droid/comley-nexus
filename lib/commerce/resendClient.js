import fs from 'fs';
import path from 'path';
import { Resend } from 'resend';
import { env, hasResend } from './env.js';
import { dataDir } from './localStore.js';

const resend = hasResend ? new Resend(env.resendApiKey) : null;
const EMAILS_DIR = path.join(dataDir, 'emails');

// Local mode: instead of sending, write the rendered email to disk and log
// it, so "order confirmation email" is still verifiable without a Resend key.
async function sendLocal({ to, subject, html }) {
  fs.mkdirSync(EMAILS_DIR, { recursive: true });
  const filename = `${Date.now()}-${subject.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
  fs.writeFileSync(path.join(EMAILS_DIR, filename), html, 'utf8');
  console.log(`[commerce/resend:local] Would send "${subject}" to ${to} — written to data/commerce/emails/${filename}`);
  return { id: filename, local: true };
}

export async function sendEmail({ to, subject, html }) {
  if (!hasResend) return sendLocal({ to, subject, html });
  return resend.emails.send({ from: env.resendFromEmail, to, subject, html });
}

export function orderConfirmationEmail(order) {
  const itemRows = order.items
    .map((i) => `<tr><td>${i.name}</td><td>${i.quantity}</td><td>$${i.price.toFixed(2)}</td></tr>`)
    .join('');
  return {
    subject: `Order confirmation — #${order.id.slice(0, 8)}`,
    html: `<h1>Thanks for your order!</h1>
<table border="1" cellpadding="8" cellspacing="0">
<thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
<tbody>${itemRows}</tbody>
</table>
<p><strong>Total: $${order.total.toFixed(2)}</strong></p>`,
  };
}

export function refundEmail(order) {
  return {
    subject: `Refund processed — #${order.id.slice(0, 8)}`,
    html: `<h1>Your refund has been processed</h1><p>Order #${order.id.slice(0, 8)} for $${order.total.toFixed(2)} has been refunded.</p>`,
  };
}
