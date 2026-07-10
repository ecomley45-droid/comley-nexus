// Email document model + block definitions, shared by the render pipeline
// (render.js), the AI generator, and the builder UI (via /api/email/blocks).
//
// A document is: { settings, rows[] } where each row has columns[], and each
// column has blocks[]. Rows map to <mj-section>, columns to <mj-column>, and
// each block to one MJML element. Keeping the model this flat is deliberate:
// it's trivial to reorder/duplicate in the editor and to walk in the renderer.

import crypto from 'crypto';

export const uid = (p = 'eb') => `${p}_${crypto.randomBytes(5).toString('hex')}`;

export const DEFAULT_SETTINGS = {
  backgroundColor: '#f4f4f7', // canvas behind the email
  contentBackground: '#ffffff',
  width: 600,
  fontFamily: 'Arial, Helvetica, sans-serif',
  textColor: '#333333',
  linkColor: '#2563eb',
  preheader: '', // hidden inbox preview text
};

// The palette shown in the builder's "add block" tray (mirrors the Sailthru
// content tray: Columns, Button, Divider, Heading, HTML, Image, Menu, Social,
// Text, Timer, Video). `defaults` seed a freshly-dropped block.
export const BLOCK_TYPES = {
  heading: { label: 'Heading', defaults: { text: 'Your headline', level: 2, align: 'left', color: '', fontSize: 24 } },
  text: { label: 'Text', defaults: { html: 'Write something worth reading.', align: 'left', color: '', fontSize: 15 } },
  button: { label: 'Button', defaults: { label: 'Shop now', href: 'https://', backgroundColor: '#2563eb', color: '#ffffff', align: 'center', borderRadius: 6 } },
  image: { label: 'Image', defaults: { src: 'https://placehold.co/600x300?text=Image', alt: '', href: '', align: 'center', width: 600 } },
  divider: { label: 'Divider', defaults: { color: '#e5e7eb', thickness: 1, padding: 12 } },
  spacer: { label: 'Spacer', defaults: { height: 24 } },
  social: { label: 'Social', defaults: { align: 'center', items: [{ network: 'instagram', href: 'https://' }, { network: 'facebook', href: 'https://' }, { network: 'x', href: 'https://' }] } },
  menu: { label: 'Menu', defaults: { align: 'center', color: '#333333', links: [{ label: 'Home', href: 'https://' }, { label: 'Shop', href: 'https://' }, { label: 'About', href: 'https://' }] } },
  video: { label: 'Video', defaults: { thumbnail: 'https://placehold.co/600x338?text=%E2%96%B6+Watch', href: 'https://', alt: 'Watch the video' } },
  timer: { label: 'Timer', defaults: { label: 'Offer ends', targetDate: '' } },
  html: { label: 'HTML', defaults: { html: '<p>Custom HTML</p>' } },
};

export const BLOCK_LIST = Object.entries(BLOCK_TYPES).map(([type, v]) => ({ type, label: v.label }));

export function makeBlock(type) {
  const def = BLOCK_TYPES[type];
  if (!def) throw new Error(`Unknown email block type "${type}"`);
  return { id: uid('blk'), type, ...structuredClone(def.defaults) };
}

// A row with N equal columns, each empty (or seeded with blocks).
export function makeRow(columnCount = 1) {
  return {
    id: uid('row'),
    backgroundColor: '',
    columns: Array.from({ length: Math.max(1, columnCount) }, () => ({ blocks: [] })),
  };
}

export function makeDocument(rows = []) {
  return { settings: { ...DEFAULT_SETTINGS }, rows };
}

// ---- Starter gallery templates (seeded platform-wide) ----
// Kept as builder documents so they open in the editor fully editable, and
// so the renderer is the single source of truth for their HTML.
function row(cols, ...blocks) {
  const r = makeRow(cols);
  blocks.forEach((b, i) => { r.columns[i % cols].blocks.push(b); });
  return r;
}
const b = (type, props) => ({ ...makeBlock(type), ...props });

export const STARTER_TEMPLATES = [
  {
    id: 'tmpl_welcome',
    name: 'Welcome',
    category: 'Lifecycle',
    document: makeDocument([
      row(1, b('image', { src: 'https://placehold.co/600x200?text=Your+Brand', width: 600 })),
      row(1, b('heading', { text: 'Welcome aboard 👋', align: 'center' })),
      row(1, b('text', { html: 'We’re glad you’re here. Here’s how to get the most out of your first week.', align: 'center' })),
      row(1, b('button', { label: 'Get started', align: 'center' })),
      row(1, b('divider', {})),
      row(1, b('social', {})),
    ]),
  },
  {
    id: 'tmpl_sale',
    name: 'Promotion / Sale',
    category: 'Marketing',
    document: makeDocument([
      row(1, b('heading', { text: 'Summer sale — 25% off', align: 'center', fontSize: 28 })),
      row(1, b('text', { html: 'For this week only. Use code <strong>SUMMER25</strong> at checkout.', align: 'center' })),
      row(2, b('image', { src: 'https://placehold.co/280x280?text=Product+A' }), b('image', { src: 'https://placehold.co/280x280?text=Product+B' })),
      row(1, b('button', { label: 'Shop the sale', align: 'center' })),
      row(1, b('timer', { label: 'Sale ends' })),
    ]),
  },
  {
    id: 'tmpl_newsletter',
    name: 'Newsletter',
    category: 'Editorial',
    document: makeDocument([
      row(1, b('heading', { text: 'The Monthly', align: 'left' })),
      row(1, b('text', { html: 'What we’ve been working on, reading, and shipping this month.', align: 'left' })),
      row(1, b('divider', {})),
      row(2, b('heading', { text: 'Story one', level: 3 }), b('heading', { text: 'Story two', level: 3 })),
      row(2, b('text', { html: 'A short teaser for the first story goes here.' }), b('text', { html: 'A short teaser for the second story goes here.' })),
      row(1, b('menu', {})),
    ]),
  },
];
