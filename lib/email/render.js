// Email render pipeline: builder document -> MJML -> Outlook-safe HTML.
//
// MJML (v5, async) owns the hard cross-client compatibility problem — ghost
// tables for Outlook, inline styles, bulletproof buttons — so our job is just
// to map the flat block model onto MJML elements. compile() is the single
// source of truth used by both the live preview and the actual send, so what
// a user previews is byte-identical to what lands in the inbox.

import mjml2html from 'mjml';
import { sanitizeContentHtml } from '../sanitize.js';
import { DEFAULT_SETTINGS } from './blocks.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Attribute values: escape quotes so a stray " can't break out of an attr.
const attr = (s) => String(s ?? '').replace(/"/g, '&quot;');

// MJML's mj-social knows a fixed set of network names; map ours onto them.
const SOCIAL_NAMES = { instagram: 'instagram', facebook: 'facebook', x: 'twitter', twitter: 'twitter', linkedin: 'linkedin', tiktok: 'tiktok', youtube: 'youtube' };

function blockToMjml(block, settings) {
  const b = block || {};
  switch (b.type) {
    case 'heading': {
      const size = Number(b.fontSize) || 24;
      const color = b.color || settings.textColor;
      return `<mj-text align="${attr(b.align || 'left')}" font-size="${size}px" font-weight="bold" color="${attr(color)}" line-height="1.3">${esc(b.text)}</mj-text>`;
    }
    case 'text': {
      const size = Number(b.fontSize) || 15;
      const color = b.color || settings.textColor;
      // Body copy may contain inline markup (bold/links) — sanitize, don't escape.
      return `<mj-text align="${attr(b.align || 'left')}" font-size="${size}px" color="${attr(color)}" line-height="1.6">${sanitizeContentHtml(b.html || '')}</mj-text>`;
    }
    case 'button':
      return `<mj-button href="${attr(b.href || '#')}" background-color="${attr(b.backgroundColor || '#2563eb')}" color="${attr(b.color || '#ffffff')}" border-radius="${Number(b.borderRadius) || 6}px" align="${attr(b.align || 'center')}">${esc(b.label || 'Button')}</mj-button>`;
    case 'image':
      return `<mj-image src="${attr(b.src)}" alt="${attr(b.alt)}"${b.href ? ` href="${attr(b.href)}"` : ''} align="${attr(b.align || 'center')}"${b.width ? ` width="${Number(b.width)}px"` : ''} />`;
    case 'divider':
      return `<mj-divider border-color="${attr(b.color || '#e5e7eb')}" border-width="${Number(b.thickness) || 1}px" padding="${b.padding ?? 12}px 0" />`;
    case 'spacer':
      return `<mj-spacer height="${Number(b.height) || 24}px" />`;
    case 'social': {
      const els = (b.items || []).map((it) => {
        const name = SOCIAL_NAMES[it.network];
        return name ? `<mj-social-element name="${name}" href="${attr(it.href || '#')}" />` : '';
      }).join('');
      return `<mj-social font-size="13px" mode="horizontal" align="${attr(b.align || 'center')}">${els}</mj-social>`;
    }
    case 'menu': {
      // Rendered as a centered row of links inside mj-text — more reliable
      // across clients than mj-navbar's hamburger toggle.
      const links = (b.links || []).map((l) => `<a href="${attr(l.href || '#')}" style="color:${attr(b.color || settings.linkColor)};text-decoration:none;padding:0 10px">${esc(l.label)}</a>`).join('<span style="color:#ccc">·</span>');
      return `<mj-text align="${attr(b.align || 'center')}" font-size="14px">${links}</mj-text>`;
    }
    case 'video':
      // Email can't embed video — the standard is a clickable thumbnail.
      return `<mj-image src="${attr(b.thumbnail)}" alt="${attr(b.alt || 'Watch')}" href="${attr(b.href || '#')}" />`;
    case 'timer': {
      // Static styled deadline. A live-ticking countdown needs an external
      // countdown-image service (a follow-up); this renders the target date.
      const when = b.targetDate ? new Date(b.targetDate).toLocaleString() : '';
      return `<mj-text align="center" font-size="16px" font-weight="bold">${esc(b.label || 'Ends')}${when ? ` — ${esc(when)}` : ''}</mj-text>`;
    }
    case 'html':
      return `<mj-raw>${sanitizeContentHtml(b.html || '')}</mj-raw>`;
    default:
      return '';
  }
}

export function documentToMjml(doc) {
  const settings = { ...DEFAULT_SETTINGS, ...(doc?.settings || {}) };
  const rows = Array.isArray(doc?.rows) ? doc.rows : [];
  const sections = rows.map((r) => {
    const cols = (r.columns || []).map((col) => {
      const blocks = (col.blocks || []).map((blk) => blockToMjml(blk, settings)).join('\n');
      return `<mj-column>${blocks}</mj-column>`;
    }).join('\n');
    const bg = r.backgroundColor ? ` background-color="${attr(r.backgroundColor)}"` : '';
    return `<mj-section${bg} padding="8px 0">${cols}</mj-section>`;
  }).join('\n');

  return `<mjml>
  <mj-head>
    ${settings.preheader ? `<mj-preview>${esc(settings.preheader)}</mj-preview>` : ''}
    <mj-attributes>
      <mj-all font-family="${attr(settings.fontFamily)}" />
      <mj-text color="${attr(settings.textColor)}" />
    </mj-attributes>
  </mj-head>
  <mj-body width="${Number(settings.width) || 600}px" background-color="${attr(settings.backgroundColor)}">
    <mj-wrapper background-color="${attr(settings.contentBackground)}" padding="16px 0">
${sections}
    </mj-wrapper>
  </mj-body>
</mjml>`;
}

// Compile a document to final email HTML. Returns { html, errors }.
export async function compile(doc) {
  const mjmlSrc = documentToMjml(doc);
  const { html, errors } = await mjml2html(mjmlSrc, { validationLevel: 'soft' });
  return { html, errors: errors || [] };
}
