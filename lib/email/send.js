// Campaign send engine: compile the document once, then per recipient add
// open/click tracking and deliver via Resend. Like the social layer, it has a
// sandbox: with EMAIL_SANDBOX=1 or no Resend configured, it "sends" to the
// server log and records delivered events, so the whole flow (audience →
// send → stats → profiles) is testable locally with only Supabase.

import { Resend } from 'resend';
import { encryptSecret, decryptSecret } from '../secretCrypto.js';
import { compile } from './render.js';
import * as campaigns from './campaigns.js';
import * as audience from './audience.js';

let client = null;
const resend = () => {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
};

export const isSandbox = () => process.env.EMAIL_SANDBOX === '1' || !resend() || !process.env.RESEND_FROM;

const baseUrl = () => (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

// Opaque per-recipient token so tracking URLs don't carry raw email/campaign.
export function signToken(payload) { return encodeURIComponent(encryptSecret(JSON.stringify(payload))); }
export function readToken(raw) { try { return JSON.parse(decryptSecret(decodeURIComponent(raw))); } catch { return null; } }

// Inject the open pixel + rewrite links to the click-tracking redirect. Skips
// entirely when PUBLIC_BASE_URL is unset (tracking needs absolute URLs).
function addTracking(html, { orgId, campaignId, email }) {
  const base = baseUrl();
  if (!base) return html;
  const token = signToken({ o: orgId, c: campaignId, e: email });
  const pixel = `<img src="${base}/api/email/track/open/${token}" width="1" height="1" alt="" style="display:none" />`;
  let out = html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url) =>
    `href="${base}/api/email/track/click/${token}?u=${encodeURIComponent(url)}"`);
  out = out.includes('</body>') ? out.replace('</body>', `${pixel}</body>`) : out + pixel;
  return out;
}

// Send (or sandbox-send) a campaign. Idempotent-ish: refuses to resend a
// campaign already 'sent'.
export async function sendCampaign(orgId, campaignId) {
  const campaign = await campaigns.get(orgId, campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sent') return { skipped: true, reason: 'already sent' };
  if (!campaign.subject?.trim()) throw new Error('Add a subject line before sending.');

  await campaigns.setStatus(campaignId, 'sending');
  try {
    const { html } = await compile(campaign.document);
    const recipients = await audience.resolve(orgId, campaign.audience);
    if (recipients.length === 0) {
      await campaigns.setStatus(campaignId, 'failed', { stats: { recipients: 0, delivered: 0, error: 'No recipients' } });
      return { recipients: 0, delivered: 0 };
    }

    const from = process.env.RESEND_FROM;
    const r = resend();
    const sandbox = isSandbox();
    let delivered = 0;

    for (const email of recipients) {
      const personalized = addTracking(html, { orgId, campaignId, email });
      try {
        if (sandbox) {
          console.log(`[email/sandbox] would send "${campaign.subject}" to ${email}`);
        } else {
          await r.emails.send({ from, to: [email], subject: campaign.subject, html: personalized });
        }
        delivered++;
      } catch (e) {
        console.error(`[email/send] ${email}:`, e.message);
      }
    }

    // Record delivered events for the profile view (chunked insert).
    await recordDelivered(orgId, campaignId, recipients);

    await campaigns.setStatus(campaignId, 'sent', {
      sent_at: new Date().toISOString(),
      stats: { recipients: recipients.length, delivered, opens: 0, clicks: 0, sandbox },
    });
    return { recipients: recipients.length, delivered, sandbox };
  } catch (e) {
    await campaigns.setStatus(campaignId, 'failed', { stats: { error: e.message } });
    throw e;
  }
}

async function recordDelivered(orgId, campaignId, emails) {
  // Best-effort; a stats row failing shouldn't fail the send.
  for (const email of emails) {
    try { await campaigns.recordEvent(orgId, { campaignId, contactEmail: email, type: 'delivered' }); }
    catch { /* ignore */ }
  }
}

// Aggregate a campaign's events into { delivered, opens, clicks, openRate }.
export async function campaignStats(campaignId) {
  const events = await campaigns.eventsForCampaign(campaignId);
  const byType = { delivered: new Set(), open: new Set(), click: new Set() };
  for (const e of events) byType[e.type]?.add(e.contact_email);
  const delivered = byType.delivered.size;
  const opens = byType.open.size;
  const clicks = byType.click.size;
  return { delivered, opens, clicks, openRate: delivered ? opens / delivered : 0, clickRate: delivered ? clicks / delivered : 0 };
}

// Durable sweep of scheduled campaigns whose time has passed.
export async function sendDueSweep() {
  const due = await campaigns.listDue();
  let sent = 0;
  for (const { id, org_id } of due) {
    try { await sendCampaign(org_id, id); sent++; }
    catch (e) { console.error(`[email/sweep] ${id}:`, e.message); }
  }
  return { due: due.length, sent };
}

// 1x1 transparent GIF for the open pixel.
export const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
