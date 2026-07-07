// Complete starter sites, built entirely from the existing block system --
// each template is a list of pages whose sections carry blockType+fields
// (the same shape "Add Layout/Block +" inserts), so everything a template
// creates is immediately editable in the structured editor like any
// hand-added block. `buildTemplateSite()` renders each section's html via
// the real blockRenderers at application time, so template output always
// matches current renderer markup instead of drifting in stored HTML.
//
// Used server-side by POST /api/orgs (templateId param) at workspace
// creation. Themes reference the same palette values as themePresets.js.

import { renderBlock } from '../cms/lib/pasteIn/blockRenderers.js';

const FOOTER = (name) => ({
  name: 'Footer', blockType: 'footer',
  fields: {
    text: [`© 2026 ${name}. All rights reserved.`],
    links: [{ href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' }],
  },
});

const HEADER = (name, links) => ({
  name: 'Header', blockType: 'header',
  fields: { headings: [name], text: [], images: [], links },
});

const CONTACT_PAGE = (name, intro) => ({
  name: 'Contact', slug: 'contact',
  sections: [
    HEADER(name, [{ href: '/', label: 'Home' }, { href: '/contact', label: 'Contact' }]),
    {
      name: 'Contact form', blockType: 'form',
      fields: { headings: ['Get in touch'], text: [intro], buttonLabel: 'Send message' },
    },
    FOOTER(name),
  ],
});

export const SITE_TEMPLATES = [
  {
    id: 'agency',
    name: 'Agency / Studio',
    description: 'A design or marketing studio: services, work, team, and a contact page.',
    theme: { primary: '#6366f1', secondary: '#d946ef', bg: '#070a13', text: '#e2e8f0', accent: '#6366f1', link: '#a5b4fc', muted: '#a1a1aa', fontFamily: 'system', fontScale: 'comfortable' },
    siteNamePlaceholder: 'Studio Name',
    pages: [
      {
        name: 'Home', slug: 'index',
        sections: [
          HEADER('Studio Name', [{ href: '/', label: 'Home' }, { href: '/work', label: 'Work' }, { href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' }]),
          { name: 'Hero', blockType: 'hero', fields: { headings: ['Design that moves your business forward'], text: ['We build brands, websites, and campaigns for companies that want to stand out.'], links: [{ href: '/contact', label: 'Start a project' }] } },
          { name: 'Services', blockType: 'card-grid', fields: { headings: ['What we do'], items: [
            { heading: 'Brand identity', body: 'Logos, guidelines, and a voice your customers remember.' },
            { heading: 'Web design', body: 'Fast, beautiful sites that convert visitors into clients.' },
            { heading: 'Campaigns', body: 'Launches and always-on marketing that actually get measured.' },
          ] } },
          { name: 'Stats', blockType: 'stats', fields: { headings: ['The track record'], items: [
            { heading: '120+', body: 'Projects shipped' }, { heading: '9 yrs', body: 'In business' }, { heading: '96%', body: 'Clients who return' },
          ] } },
          { name: 'Testimonials', blockType: 'testimonials', fields: { headings: ['What clients say'], items: [
            { heading: 'Dana W.', meta: 'Founder, Fieldnote', body: '"They treated our launch like it was their own. Best agency experience we\'ve had."' },
            { heading: 'Marcus L.', meta: 'CMO, Brightline', body: '"Rebrand paid for itself in the first quarter."' },
          ] } },
          { name: 'CTA', blockType: 'cta', fields: { headings: ['Have a project in mind?'], text: ['Tell us where you\'re headed. We\'ll help you get there.'], links: [{ href: '/contact', label: 'Get a quote' }] } },
          FOOTER('Studio Name'),
        ],
      },
      {
        name: 'Work', slug: 'work',
        sections: [
          HEADER('Studio Name', [{ href: '/', label: 'Home' }, { href: '/work', label: 'Work' }, { href: '/contact', label: 'Contact' }]),
          { name: 'Intro', blockType: 'feature', fields: { headings: ['Selected work'], text: ['A few projects we\'re proud of. Replace these with your own case studies.'] } },
          { name: 'Gallery', blockType: 'gallery', fields: { headings: [], images: [
            { src: 'https://placehold.co/600x400?text=Project+One', alt: 'Project one' },
            { src: 'https://placehold.co/600x400?text=Project+Two', alt: 'Project two' },
            { src: 'https://placehold.co/600x400?text=Project+Three', alt: 'Project three' },
          ] } },
          FOOTER('Studio Name'),
        ],
      },
      {
        name: 'About', slug: 'about',
        sections: [
          HEADER('Studio Name', [{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' }]),
          { name: 'Story', blockType: 'content', fields: { headings: ['A small team that ships big work'], text: ['We started in a spare bedroom with one client and a borrowed monitor. Nine years later, we\'re still small on purpose — senior people only, no account-manager telephone game.'], images: [], links: [] } },
          { name: 'Team', blockType: 'team', fields: { headings: ['The team'], items: [
            { heading: 'Alex Rivera', meta: 'Creative Director', body: 'Sets the bar and holds it.', image: 'https://placehold.co/200x200?text=AR' },
            { heading: 'Priya Shah', meta: 'Design Lead', body: 'Makes everything look inevitable.', image: 'https://placehold.co/200x200?text=PS' },
          ] } },
          FOOTER('Studio Name'),
        ],
      },
      CONTACT_PAGE('Studio Name', 'Tell us about your project and timeline — we reply within one business day.'),
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant / Café',
    description: 'A restaurant site: menu highlights, full menu, hours, and reservations.',
    theme: { primary: '#b45309', secondary: '#78350f', bg: '#1c1917', text: '#f5f0e8', accent: '#d97706', link: '#fbbf24', muted: '#a8a29e', fontFamily: 'serif', fontScale: 'comfortable' },
    siteNamePlaceholder: 'The Copper Table',
    pages: [
      {
        name: 'Home', slug: 'index',
        sections: [
          HEADER('The Copper Table', [{ href: '/', label: 'Home' }, { href: '/menu', label: 'Menu' }, { href: '/contact', label: 'Reservations' }]),
          { name: 'Hero banner', blockType: 'banner', fields: { headings: ['Seasonal food, wood fire, no fuss'], text: ['Dinner Tuesday–Sunday from 5pm. Walk-ins welcome at the bar.'], images: [{ src: 'https://placehold.co/1200x400?text=Dining+room', alt: 'Dining room' }], links: [{ href: '/contact', label: 'Book a table' }] } },
          { name: 'Menu highlights', blockType: 'card-grid', fields: { headings: ['From this week\'s menu'], items: [
            { heading: 'Charred leeks', body: 'Romesco, marcona almonds, smoked salt.' },
            { heading: 'Half chicken', body: 'Wood-roasted, salsa verde, grilled lemon.' },
            { heading: 'Basque cheesecake', body: 'Burnt top, soft center, no regrets.' },
          ] } },
          { name: 'Reviews', blockType: 'testimonials', fields: { headings: ['Word of mouth'], items: [
            { heading: 'Local Eats Weekly', meta: '★★★★★', body: '"The best new room in the neighborhood — go for the chicken, stay for the cheesecake."' },
          ] } },
          { name: 'Hours CTA', blockType: 'cta', fields: { headings: ['Tue–Sun · 5pm–late'], text: ['123 Main Street. Reservations recommended for parties of 5+.'], links: [{ href: '/contact', label: 'Reserve' }] } },
          FOOTER('The Copper Table'),
        ],
      },
      {
        name: 'Menu', slug: 'menu',
        sections: [
          HEADER('The Copper Table', [{ href: '/', label: 'Home' }, { href: '/menu', label: 'Menu' }, { href: '/contact', label: 'Reservations' }]),
          { name: 'Starters', blockType: 'list', fields: { headings: ['To start'], items: [
            { heading: 'Sourdough & cultured butter — 6', body: 'Baked in-house every afternoon.' },
            { heading: 'Charred leeks — 14', body: 'Romesco, marcona almonds, smoked salt.' },
          ] } },
          { name: 'Mains', blockType: 'list', fields: { headings: ['Mains'], items: [
            { heading: 'Half chicken — 28', body: 'Wood-roasted, salsa verde, grilled lemon.' },
            { heading: 'Market fish — 32', body: 'Ask your server about today\'s catch.' },
          ] } },
          FOOTER('The Copper Table'),
        ],
      },
      CONTACT_PAGE('The Copper Table', 'For parties of 5 or more, or private events, drop us a note.'),
    ],
  },
  {
    id: 'portfolio',
    name: 'Personal Portfolio',
    description: 'A personal site: work, a short bio, and a way to reach you.',
    theme: { primary: '#18181b', secondary: '#3f3f46', bg: '#09090b', text: '#fafafa', accent: '#e4e4e7', link: '#a1a1aa', muted: '#71717a', fontFamily: 'mono', fontScale: 'compact' },
    siteNamePlaceholder: 'Your Name',
    pages: [
      {
        name: 'Home', slug: 'index',
        sections: [
          HEADER('Your Name', [{ href: '/', label: 'Home' }, { href: '/work', label: 'Work' }, { href: '/contact', label: 'Contact' }]),
          { name: 'Intro', blockType: 'hero', fields: { headings: ['Designer & developer building calm software'], text: ['Currently available for freelance projects. Previously at places you\'ve heard of.'], links: [{ href: '/work', label: 'See the work' }] } },
          { name: 'Recent work', blockType: 'gallery', fields: { headings: ['Recent'], images: [
            { src: 'https://placehold.co/600x400?text=Project+A', alt: 'Project A' },
            { src: 'https://placehold.co/600x400?text=Project+B', alt: 'Project B' },
          ] } },
          { name: 'Social', blockType: 'social-links', fields: { links: [
            { href: 'https://github.com', label: 'GitHub' }, { href: 'https://dribbble.com', label: 'Dribbble' }, { href: 'https://linkedin.com', label: 'LinkedIn' },
          ] } },
          FOOTER('Your Name'),
        ],
      },
      {
        name: 'Work', slug: 'work',
        sections: [
          HEADER('Your Name', [{ href: '/', label: 'Home' }, { href: '/work', label: 'Work' }, { href: '/contact', label: 'Contact' }]),
          { name: 'Projects', blockType: 'card-grid', fields: { headings: ['Selected projects'], items: [
            { heading: 'Project A', body: 'Product design for a fintech dashboard.', image: 'https://placehold.co/400x240?text=A', link: '#' },
            { heading: 'Project B', body: 'Brand and site for an indie hardware startup.', image: 'https://placehold.co/400x240?text=B', link: '#' },
            { heading: 'Project C', body: 'Design system for a healthcare platform.', image: 'https://placehold.co/400x240?text=C', link: '#' },
          ] } },
          FOOTER('Your Name'),
        ],
      },
      CONTACT_PAGE('Your Name', 'For project inquiries, include a rough budget and timeline.'),
    ],
  },
  {
    id: 'local-service',
    name: 'Local Service Business',
    description: 'A trades/services business: services, pricing, FAQs, and quote requests.',
    theme: { primary: '#1e3a5f', secondary: '#b8860b', bg: '#0b1220', text: '#e5e9f0', accent: '#c9a227', link: '#93b4d8', muted: '#94a3b8', fontFamily: 'classic', fontScale: 'comfortable' },
    siteNamePlaceholder: 'Hometown Services Co.',
    pages: [
      {
        name: 'Home', slug: 'index',
        sections: [
          HEADER('Hometown Services Co.', [{ href: '/', label: 'Home' }, { href: '/services', label: 'Services' }, { href: '/contact', label: 'Get a quote' }]),
          { name: 'Hero', blockType: 'hero', fields: { headings: ['Reliable service, straight answers, fair prices'], text: ['Licensed, insured, and on time. Serving the metro area for 15 years.'], links: [{ href: '/contact', label: 'Get a free quote' }] } },
          { name: 'Services', blockType: 'card-grid', fields: { headings: ['What we handle'], items: [
            { heading: 'Repairs', body: 'Same-week scheduling for most jobs.' },
            { heading: 'Installations', body: 'Quoted up front. No surprise line items.' },
            { heading: 'Maintenance plans', body: 'Seasonal check-ups so small problems stay small.' },
          ] } },
          { name: 'Stats', blockType: 'stats', fields: { headings: [], items: [
            { heading: '15 yrs', body: 'In business' }, { heading: '4.9★', body: 'Average review' }, { heading: '24hr', body: 'Emergency line' },
          ] } },
          { name: 'FAQ', blockType: 'faq', fields: { headings: ['Common questions'], items: [
            { heading: 'Do you give free estimates?', body: 'Yes — every quote is free and holds for 30 days.' },
            { heading: 'Are you licensed and insured?', body: 'Fully. License numbers available on request.' },
          ] } },
          { name: 'CTA', blockType: 'cta', fields: { headings: ['Ready when you are'], text: ['Most quotes turned around the same day.'], links: [{ href: '/contact', label: 'Request a quote' }] } },
          FOOTER('Hometown Services Co.'),
        ],
      },
      {
        name: 'Services', slug: 'services',
        sections: [
          HEADER('Hometown Services Co.', [{ href: '/', label: 'Home' }, { href: '/services', label: 'Services' }, { href: '/contact', label: 'Get a quote' }]),
          { name: 'Service list', blockType: 'list', fields: { headings: ['Services & rates'], items: [
            { heading: 'Diagnostic visit — $89', body: 'Applied to the job if you book with us.' },
            { heading: 'Standard repair — from $150', body: 'Most common fixes, parts included.' },
            { heading: 'Full installation — quoted', body: 'Free on-site assessment first.' },
          ] } },
          { name: 'Plans', blockType: 'pricing-table', fields: { headings: ['Maintenance plans'], plans: [
            { name: 'Seasonal', price: '$19', period: '/mo', features: ['2 check-ups a year', 'Priority scheduling'], ctaLabel: 'Sign up', ctaHref: '/contact', highlighted: false },
            { name: 'Total care', price: '$39', period: '/mo', features: ['4 check-ups a year', '10% off all repairs', '24hr emergency line'], ctaLabel: 'Sign up', ctaHref: '/contact', highlighted: true },
          ] } },
          FOOTER('Hometown Services Co.'),
        ],
      },
      CONTACT_PAGE('Hometown Services Co.', 'Describe the job and your zip code — we\'ll reply with a quote or a visit time.'),
    ],
  },
];

// Materializes a template into ready-to-save page objects (html rendered
// through the real block renderers) + the theme to apply. Shape matches
// blankPage() in src/cms/lib/pageActions.js.
export function buildTemplateSite(templateId) {
  const template = SITE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;
  const stamp = Date.now();
  const pages = template.pages.map((p, pi) => ({
    id: `page-${stamp}-${pi}`,
    name: p.name,
    slug: p.slug,
    parentId: null,
    content: p.sections.map((s, si) => ({
      id: `sec-${stamp}-${pi}-${si}`,
      name: s.name,
      blockType: s.blockType,
      fields: s.fields,
      html: renderBlock(s.blockType, s.fields) || '',
    })),
    editorMode: 'blocks',
    fullHtml: '',
    seo: { title: '', description: '', ogImage: '' },
    status: 'published',
    scheduledPublishAt: null,
    analytics: { headSnippet: '', bodySnippet: '' },
    layout: { useGlobalHeader: true, useGlobalFooter: true, headerOverride: '', footerOverride: '' },
  }));
  return { pages, theme: { ...template.theme } };
}
