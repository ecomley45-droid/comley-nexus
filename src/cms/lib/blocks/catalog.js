// Single source of truth for the pre-built block catalog -- used by both
// BlockCatalogPicker.jsx (the "Add Block +" picker in the page editor) and
// BlocksCatalogPage.jsx (the browsable reference page), so they can never
// drift apart. Each entry's `defaultFields` is realistic placeholder
// content ready to edit, not empty scaffolding -- picking one from the
// picker should look like something immediately, matching how other
// no-code builders' block libraries behave.
//
// `blockType` maps to a renderer in blockRenderers.js. Multiple catalog
// entries can share one blockType with different default fields/purpose
// (e.g. "Feature Grid" and "Card Grid" both render via card-grid).

import { renderBlock } from '../pasteIn/blockRenderers.js';

const ph = (w, h, text) => ({ src: `https://placehold.co/${w}x${h}?text=${encodeURIComponent(text)}`, alt: text });

const CATALOG_RAW = [
  // ---------- Structure ----------
  {
    id: 'header', blockType: 'header', category: 'Structure', name: 'Header',
    description: 'Logo/site name on the left, nav links on the right.',
    defaultFields: { headings: ['Your Brand'], text: [], images: [], links: [
      { href: '/', label: 'Home' }, { href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' },
    ] },
  },
  {
    id: 'navigation', blockType: 'navigation', category: 'Structure', name: 'Navigation',
    description: 'A standalone horizontal link bar, without the logo/header chrome.',
    defaultFields: { headings: [], text: [], images: [], links: [
      { href: '/', label: 'Home' }, { href: '/products', label: 'Products' }, { href: '/pricing', label: 'Pricing' },
    ] },
  },
  {
    id: 'footer', blockType: 'footer', category: 'Structure', name: 'Footer',
    description: 'Copyright line plus a row of links.',
    defaultFields: { headings: [], text: ['© 2026 Your Company. All rights reserved.'], images: [], links: [
      { href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' },
    ] },
  },
  {
    id: 'breadcrumb', blockType: 'breadcrumb', category: 'Structure', name: 'Breadcrumb',
    description: 'A manually-entered "you are here" trail. Not linked to real page hierarchy yet -- edit the links to match this page’s location.',
    defaultFields: { links: [
      { href: '/', label: 'Home' }, { href: '#', label: 'Category' }, { href: '#', label: 'Current page' },
    ] },
  },

  // ---------- Content ----------
  {
    id: 'hero', blockType: 'hero', category: 'Content', name: 'Hero',
    description: 'Big headline, supporting line, one call-to-action button.',
    defaultFields: {
      headings: ['A bold headline that grabs attention'],
      text: ['Supporting copy that explains the value in one or two sentences.'],
      images: [], links: [{ href: '#', label: 'Get started' }],
    },
  },
  {
    id: 'banner', blockType: 'banner', category: 'Content', name: 'Banner',
    description: 'A shorter hero with a background image, for announcements.',
    defaultFields: {
      headings: ['Announcing something new'],
      text: ['A short supporting line goes here.'],
      images: [ph(1200, 400, 'Banner image')],
      links: [{ href: '#', label: 'Learn more' }],
    },
  },
  {
    id: 'rich-text', blockType: 'content', category: 'Content', name: 'Rich Text',
    description: 'Freeform heading + paragraphs for anything that doesn’t need a template.',
    defaultFields: {
      headings: ['A rich text section'],
      text: ['Write anything here — announcements, longer-form copy, or supporting detail for the page.'],
      images: [], links: [],
    },
  },
  {
    id: 'feature-grid', blockType: 'card-grid', category: 'Content', name: 'Feature Grid',
    description: 'A row of title + description cards, for listing product features.',
    defaultFields: {
      headings: ['Everything you need'], text: [], images: [], links: [],
      items: [
        { heading: 'Fast', body: 'Ships in minutes, not weeks.' },
        { heading: 'Secure', body: 'Sanitized by default, no exceptions.' },
        { heading: 'Flexible', body: 'Structured fields or raw HTML — your choice.' },
      ],
    },
  },
  {
    id: 'stats', blockType: 'stats', category: 'Content', name: 'Stats / Counters',
    description: 'A row of big numbers with labels underneath.',
    defaultFields: {
      headings: ['By the numbers'],
      items: [
        { heading: '10k+', body: 'Active users' },
        { heading: '99.9%', body: 'Uptime' },
        { heading: '24/7', body: 'Support' },
      ],
    },
  },
  {
    id: 'logo-cloud', blockType: 'logo-cloud', category: 'Content', name: 'Logo Cloud',
    description: '"Trusted by" row of partner/customer logos.',
    defaultFields: {
      headings: ['Trusted by teams at'],
      images: [ph(120, 40, 'Logo'), ph(120, 40, 'Logo'), ph(120, 40, 'Logo'), ph(120, 40, 'Logo')],
    },
  },

  // ---------- Social proof ----------
  {
    id: 'testimonials', blockType: 'testimonials', category: 'Social Proof', name: 'Testimonials',
    description: 'Quote cards with author name, role, and photo.',
    defaultFields: {
      headings: ['What people are saying'],
      items: [
        { heading: 'Jane Doe', meta: 'CEO, Acme Inc.', body: '"This product changed how our team works."', image: ph(80, 80, 'JD').src },
        { heading: 'Sam Lee', meta: 'Head of Marketing, Northwind', body: '"Setup took minutes, not weeks."', image: ph(80, 80, 'SL').src },
      ],
    },
  },
  {
    id: 'team', blockType: 'team', category: 'Social Proof', name: 'Team Members',
    description: 'Photo, name, and role cards for an About/Team page.',
    defaultFields: {
      headings: ['Meet the team'],
      items: [
        { heading: 'Alex Rivera', meta: 'Founder', body: 'Building the product day to day.', image: ph(200, 200, 'Photo').src },
        { heading: 'Priya Shah', meta: 'Design', body: 'Making everything look this good.', image: ph(200, 200, 'Photo').src },
      ],
    },
  },

  // ---------- Conversion ----------
  {
    id: 'cta', blockType: 'cta', category: 'Conversion', name: 'CTA Banner',
    description: 'A focused call-to-action panel with one or two buttons.',
    defaultFields: { headings: ['Ready when you are.'], text: ['Get started in minutes.'], links: [{ href: '#', label: 'Get started' }] },
  },
  {
    id: 'pricing-table', blockType: 'pricing-table', category: 'Conversion', name: 'Pricing Table',
    description: 'Side-by-side plans with price, feature list, and a CTA each.',
    defaultFields: {
      headings: ['Simple pricing'],
      plans: [
        { name: 'Starter', price: '$49', period: '/mo', features: ['1 workspace', 'Custom domain'], ctaLabel: 'Get started', ctaHref: '#', highlighted: false },
        { name: 'Pro', price: '$129', period: '/mo', features: ['Everything in Starter', 'Unlimited pages'], ctaLabel: 'Get started', ctaHref: '#', highlighted: true },
      ],
    },
  },
  {
    id: 'newsletter', blockType: 'newsletter', category: 'Conversion', name: 'Newsletter Signup',
    description: 'Email capture panel. Static preview -- wire the button to a real subscribe endpoint before publishing.',
    defaultFields: { headings: ['Stay in the loop'], text: ['Get product updates in your inbox.'], buttonLabel: 'Subscribe' },
  },
  {
    id: 'contact-form', blockType: 'form', category: 'Conversion', name: 'Contact Form',
    description: 'A form placeholder. Static preview -- form markup isn’t generated yet, rebuild the fields you need in the block editor.',
    defaultFields: { headings: ['Get in touch'], text: ['Fill this out and we’ll get back to you.'] },
  },

  // ---------- Media ----------
  {
    id: 'image', blockType: 'image', category: 'Media', name: 'Image',
    description: 'A single centered image.',
    defaultFields: { images: [ph(900, 500, 'Image')] },
  },
  {
    id: 'gallery', blockType: 'gallery', category: 'Media', name: 'Image Gallery',
    description: 'A responsive grid of images.',
    defaultFields: { headings: ['Gallery'], images: [ph(400, 300, 'Photo 1'), ph(400, 300, 'Photo 2'), ph(400, 300, 'Photo 3')] },
  },
  {
    id: 'video', blockType: 'video', category: 'Media', name: 'Video Embed',
    description: 'An embedded YouTube or Vimeo video. Paste a normal watch/share URL -- it’s converted to an embed URL automatically.',
    defaultFields: { headings: ['Watch the demo'], text: [], videoUrl: '' },
  },

  // ---------- Interactive ----------
  {
    id: 'faq', blockType: 'faq', category: 'Interactive', name: 'FAQ Accordion',
    description: 'Click-to-expand question/answer pairs (no JavaScript, native disclosure widget).',
    defaultFields: {
      headings: ['Frequently asked questions'],
      items: [
        { heading: 'What is this?', body: 'A short, clear answer goes here.' },
        { heading: 'How do I get started?', body: 'Another clear, short answer.' },
      ],
    },
  },
  {
    id: 'tabs', blockType: 'tabs', category: 'Interactive', name: 'Tabs',
    description: 'Labeled content sections shown stacked. Not click-to-switch yet -- that needs a bigger sanitizer change (input/label tags) than this block warrants today.',
    defaultFields: {
      headings: ['Learn more'],
      items: [
        { heading: 'Overview', body: 'Overview content goes here.' },
        { heading: 'Details', body: 'Details content goes here.' },
      ],
    },
  },
  {
    id: 'countdown', blockType: 'countdown', category: 'Interactive', name: 'Countdown',
    description: 'A styled deadline display. Not a live-ticking countdown yet -- that needs inline <script>, which isn’t allowed in page content today.',
    defaultFields: {
      headings: ['Offer ends soon'], text: ['Don’t miss out.'],
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 'social-links', blockType: 'social-links', category: 'Interactive', name: 'Social Links',
    description: 'A row of pill-style links to your social profiles.',
    defaultFields: { links: [
      { href: 'https://twitter.com', label: 'Twitter' }, { href: 'https://instagram.com', label: 'Instagram' }, { href: 'https://linkedin.com', label: 'LinkedIn' },
    ] },
  },
  {
    id: 'card-grid', blockType: 'card-grid', category: 'Interactive', name: 'Card Grid',
    description: 'A grid of image + title + description cards, for products, articles, or links.',
    defaultFields: {
      headings: ['Explore'],
      items: [
        { heading: 'Card one', body: 'Description of the first item.', image: ph(400, 240, 'Image').src, link: '#' },
        { heading: 'Card two', body: 'Description of the second item.', image: ph(400, 240, 'Image').src, link: '#' },
        { heading: 'Card three', body: 'Description of the third item.', image: ph(400, 240, 'Image').src, link: '#' },
      ],
    },
  },
  {
    id: 'list', blockType: 'list', category: 'Interactive', name: 'List',
    description: 'A vertical list of title + description rows.',
    defaultFields: {
      headings: ['A list of things'],
      items: [
        { heading: 'Item one', body: 'Description of the first item.' },
        { heading: 'Item two', body: 'Description of the second item.' },
      ],
    },
  },
];

export const CATEGORIES = ['Structure', 'Content', 'Social Proof', 'Conversion', 'Media', 'Interactive'];

// Pre-render each entry's HTML once at module load so both the picker and
// the catalog page can show a live preview without recomputing it per render.
export const BLOCK_CATALOG = CATALOG_RAW.map((entry) => ({
  ...entry,
  html: renderBlock(entry.blockType, entry.defaultFields),
}));

export function buildSectionFromCatalog(entry) {
  return {
    id: `sec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: entry.name,
    blockType: entry.blockType,
    fields: entry.defaultFields,
    html: entry.html,
  };
}
