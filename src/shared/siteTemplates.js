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

// renderHeader only reads headings + links, so the block carries only those
// -- an empty `text`/`images` here would show up as editors that do nothing
// (see src/cms/lib/pasteIn/blockFields.js).
const HEADER = (name, links) => ({
  name: 'Header', blockType: 'header',
  fields: { headings: [name], links },
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


// Shared pieces for the Realtor template. The nav and footer repeat on every
// page, so they're defined once — every nav item and every call to action
// below points at a page that exists in this template.
const AGENT_NAV = [{ href: '/', label: 'Home' }, { href: '/homes', label: 'Homes for sale' }, { href: '/start', label: 'Start my search' }, { href: '/black-book', label: 'The Black Book' }, { href: '/portal', label: 'After closing' }, { href: '/about', label: 'About' }, { href: '/notes', label: 'Upstate notes' }];

const AGENT_HEADER = {
  name: 'Header', blockType: 'header',
  fields: { headings: ['Ethan Scott'], links: AGENT_NAV },
};

const AGENT_FOOTER = {
  name: 'Footer', blockType: 'footer',
  fields: {
    text: [
      'Ethan Scott · REALTOR® · SC License #146507',
      'Keller Williams Greenville Upstate · 403 Woods Lake Road, Ste. 100, Greenville, SC 29607',
      'Each Keller Williams® office is independently owned and operated. Equal Opportunity Employer, supporting the Fair Housing Act.',
    ],
    links: [
      { href: 'tel:8643809582', label: '(864) 380-9582' },
      { href: 'mailto:ethanscott21@kw.com', label: 'ethanscott21@kw.com' },
      { href: 'https://www.instagram.com/ethandreamhomes', label: 'Instagram' },
      { href: '/start', label: 'Start my search' },
    ],
  },
};

// Page furniture. The sticky bar is deliberately absent from /start — the
// form is already the whole page there, so a floating "Start my search"
// button would be pointing at itself.
const FURNITURE_PROGRESS = {
  name: 'Reading progress', blockType: 'scroll-progress', fields: { limit: 2 },
};

const FURNITURE_STICKY = {
  name: 'Sticky CTA', blockType: 'sticky-cta',
  fields: {
    links: [{ href: '/start', label: 'Start my search' }, { href: 'tel:8643809582', label: 'Call' }],
  },
};

const TRADES = [
  { heading: 'Plumbing' }, { heading: 'HVAC' }, { heading: 'Roofing' },
  { heading: 'Electrical' }, { heading: 'Foundation' }, { heading: 'Painting' },
  { heading: 'Flooring' }, { heading: 'Landscaping' }, { heading: 'General contracting' },
];

const PORTAL_FIELDS = {
  eyebrow: 'Coming soon · The homeowner portal',
  headings: ['Everything about your house, in one place.'],
  text: ['You close, the folder goes in a drawer, and three years later nobody remembers what colour the guest room was. I\'m building the fix.'],
  items: [
    // The swatch bars run brand red into the purple KW pairs it with in
    // gradients, then land on slate — decorative, so they carry no text.
    { heading: 'Every document, filed', link: 'Warranties', body: 'Appliance warranties, roof coverage, permits and manuals — searchable instead of shoved in a drawer.', meta: '#CE011F' },
    { heading: 'Room by room', link: 'Paint colours', body: 'The exact colour and finish in each room, so a touch-up takes five minutes instead of a trip to the store with a chipped-off flake.', meta: '#64018F' },
    { heading: 'A calendar that nudges you', link: 'Maintenance', body: 'Filter changes, gutter clearing, HVAC service — seasonal reminders tuned to Upstate weather.', meta: '#3A3D50' },
  ],
  buttonLabel: 'In development — my clients get first access',
};

const NOTES = [
  { heading: 'What a first-time buyer actually needs saved', meta: 'Part one', body: 'Down payment, closing costs, and the number nobody mentions until week three.', link: '/start' },
  { heading: 'Reading an inspection report without panicking', meta: 'Part two', body: 'Which findings are negotiating points and which are walk-away items.', link: '/start' },
  { heading: 'What your offer says besides the price', meta: 'Part three', body: 'Contingencies, timelines, and why the highest number does not always win.', link: '/start' },
  { heading: 'The first ninety days in a new house', meta: 'Part four', body: 'What to fix immediately, what can wait, and what to document now.', link: '/start' },
];

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
  {
    id: 'realtor',
    name: 'Realtor / Agent',
    description: 'A local real-estate agent: a short qualifying form instead of a contact box, plus the pages that make an agent worth calling twice.',
    // Keller Williams' own palette, read off kw.com rather than eyeballed: a
    // slate-neutral system (#1A1B24 / #3A3D50 / #F2F3F7) carrying one red,
    // #CE011F, which is the brand mark. Links stay blue because KW keeps them
    // blue -- red is reserved for actions, so making links red too would blur
    // the one signal the palette is built around.
    //
    // The red is only legible on light ground (5.19:1 on the page, 5.76:1
    // reversed out of white). On dark sections it goes to --accent-on-dark,
    // which is the same fix KW ships as its own dim-red token.
    theme: {
      primary: '#1A1B24', secondary: '#3A3D50', bg: '#F2F3F7', text: '#1A1B24',
      accent: '#CE011F', link: '#1652C3', muted: '#535872',
      fontFamily: 'sourceserif', fontDisplay: 'grotesk', fontMono: 'plexmono',
      fontScale: 'comfortable',
    },
    siteNamePlaceholder: 'Your Name — Real Estate',
    pages: [
      {
        name: 'Home', slug: 'index',
        sections: [
          FURNITURE_PROGRESS,
          AGENT_HEADER,
          { name: 'Hero', blockType: 'hero-video', fields: {
            eyebrow: 'Greenville · Greer · Travelers Rest',
            headings: ["I've been inside these houses since I was fifteen."],
            text: ['Renovations first, investing second, agent third. Tell me what you\'re actually looking for and I\'ll send the listings worth your Saturday — not every file that hits the MLS.'],
            links: [{ href: '/start', label: 'Start my search' }, { href: 'tel:8643809582', label: 'Call or text' }],
            buttonLabel: 'Four questions, thirty seconds',
            // Drop an .mp4 in here and it takes over from the gradient.
            videoUrl: '',
          } },
          { name: 'Black Book teaser', blockType: 'numbered-index', fields: {
            eyebrow: 'The part that starts after closing',
            headings: ['The Black Book'],
            text: ['Every homeowner eventually has a water heater fail on a Sunday. My clients get the name and number of someone who actually answers — a private list of trades I\'ve built and used since my renovation days.'],
            items: TRADES.slice(0, 6),
          } },
          { name: 'Quote band', blockType: 'parallax', fields: {
            headings: ['Most agents look at a house. I look at what it costs you in year seven.'],
            text: ['Ethan Scott · REALTOR® · SC #146507'],
            links: [{ href: '/start', label: 'Start my search' }],
          } },
          { name: 'Portal teaser', blockType: 'swatch-cards', fields: PORTAL_FIELDS },
          { name: 'Notes teaser', blockType: 'blog-cards', fields: {
            headings: ['Read before you sign anything.'],
            items: NOTES.slice(0, 4),
          } },
          { name: 'Get in touch', blockType: 'cta-band', fields: {
            headings: ['Ask me anything about the area.'],
            text: ['Not ready to start a search? Follow along, or just send me a question — my inbox is open either way.'],
            links: [{ href: '/start', label: 'Start my search' }, { href: 'mailto:ethanscott21@kw.com', label: 'Email me' }],
          } },
          AGENT_FOOTER,
          FURNITURE_STICKY,
        ],
      },
      {
        // The listings pages ship unbound: the blocks carry no collectionSlug
        // until someone creates a listings collection and picks it, at which
        // point every one of them fills itself. Shipping them empty is the
        // point -- an agent who never adds listings still gets a coherent
        // site, and one who does has the pages already built.
        name: 'Homes for sale', slug: 'homes',
        sections: [
          AGENT_HEADER,
          { name: 'Listing search', blockType: 'listing-search', fields: {
            placeholder: 'Search by address, city, or MLS #',
            showMap: true,
            emptyText: 'No listings loaded yet. Create a Property listings collection under Content, then point this block at it.',
          } },
          AGENT_FOOTER,
          FURNITURE_STICKY,
        ],
      },
      {
        // The per-listing page. Every block here reads the entry being
        // rendered, so this one page is every property's page.
        name: 'Listing', slug: 'listing',
        sections: [
          AGENT_HEADER,
          { name: 'Listing hero', blockType: 'listing-hero', fields: {} },
          { name: 'Details', blockType: 'listing-facts', fields: { headings: ['Property details'] } },
          { name: 'Features', blockType: 'listing-features', fields: { headings: ['Features'] } },
          { name: 'Payment', blockType: 'mortgage-calculator', fields: {
            headings: ['What this costs a month'],
            text: ['An estimate to get you oriented — your real payment depends on your rate, credit, insurer and escrow. Nothing you type here is sent anywhere.'],
            downPercent: 20, ratePercent: 6.5, termYears: 30,
          } },
          { name: 'Price history', blockType: 'price-history', fields: { headings: ['Price history'] } },
          { name: 'Schools', blockType: 'nearby-schools', fields: {
            headings: ['Nearby schools'],
            text: ['A starting point only — confirm current attendance zones with Greenville County Schools before you count on them.'],
          } },
          { name: 'Ask about this one', blockType: 'cta-band', fields: {
            headings: ['Want to see this one?'],
            text: ['Tell me when you\'re free and I\'ll get you in — or send me the address of something else you\'ve spotted.'],
            links: [{ href: '/start', label: 'Start my search' }, { href: 'tel:8643809582', label: 'Call or text' }],
          } },
          AGENT_FOOTER,
          FURNITURE_STICKY,
        ],
      },
      {
        name: 'Start my search', slug: 'start',
        sections: [
          AGENT_HEADER,
          { name: 'Intro', blockType: 'feature', fields: {
            headings: ['Four questions, thirty seconds.'],
            text: ['Tell me what you\'re looking for and I\'ll set up a search that only sends you homes worth a Saturday. You\'ll hear from me, not a call centre.'],
          } },
          { name: 'Search form', blockType: 'lead-form', fields: {
            headings: ['Home search preferences'],
            items: [
              { heading: 'What brings you here?', link: 'Pick one. You can change your mind later — most people do.', meta: 'single', body: 'Buying a home, Selling my home, Both at once, Investing', image: 'intent' },
              { heading: 'Which part of the Upstate?', link: 'Choose as many as you like.', meta: 'multi', body: 'Greenville, Greer, Simpsonville, Five Forks, Travelers Rest, Taylors, Still deciding', image: 'areas' },
              { heading: 'Price range.', link: 'Rough is fine. It only shapes what I send you.', meta: 'single', body: 'Under $300k, $300-500k, $500-750k, $750k+', image: 'price' },
              { heading: 'When would you like to move?', link: 'No wrong answer.', meta: 'single', body: 'Next 3 months, 3-6 months, 6-12 months, Just watching', image: 'timing' },
            ],
            buttonLabel: 'Where should I send them?',
            placeholder: 'You\'ll hear from me, not a call centre.',
            consent: 'Send me matching listings and Upstate market notes by email. I can unsubscribe any time. If I\'ve given a phone number, Ethan may text or call me about my search.',
          } },
          { name: 'What happens next', blockType: 'steps', fields: {
            headings: ['What happens next'],
            text: ['No mystery, and no drip you can\'t get out of.'],
            items: [
              { heading: 'A confirmation today', body: 'An email with the search I\'ve set up for you.' },
              { heading: 'Listings as they land', body: 'New homes that fit arrive in your inbox as they hit the market.' },
              { heading: 'A real follow-up', body: 'I follow up personally within one business day.' },
            ],
          } },
          AGENT_FOOTER,
        ],
      },
      {
        name: 'The Black Book', slug: 'black-book',
        sections: [
          AGENT_HEADER,
          { name: 'Trades index', blockType: 'numbered-index', fields: {
            eyebrow: 'The part that starts after closing',
            headings: ['The Black Book'],
            text: ['A private list of trades I\'ve built and used since my renovation days. My clients get the name and number of someone who actually answers — and they go to the front of the line.'],
            items: TRADES,
          } },
          { name: 'Not a referral scheme', blockType: 'feature', fields: {
            headings: ['Not a referral scheme.'],
            text: ['These are people whose work I\'ve stood next to. No kickbacks, no arrangement — which is exactly why my clients keep my number in their phone years after the sale.'],
          } },
          { name: 'CTA', blockType: 'cta-band', fields: {
            headings: ['Want the list?'],
            text: ['It comes with every home I sell.'],
            links: [{ href: '/start', label: 'Start my search' }],
          } },
          AGENT_FOOTER,
          FURNITURE_STICKY,
        ],
      },
      {
        name: 'After closing', slug: 'portal',
        sections: [
          AGENT_HEADER,
          { name: 'Portal', blockType: 'swatch-cards', fields: PORTAL_FIELDS },
          { name: 'Why', blockType: 'split-content', fields: {
            headings: ['Your house, still documented in year seven.'],
            text: ['You close, the folder goes in a drawer, and three years later nobody remembers what colour the guest room was. I\'m building the fix — a private portal that comes with every home I sell.'],
            links: [{ href: '/start', label: 'Start my search' }],
          } },
          AGENT_FOOTER,
          FURNITURE_STICKY,
        ],
      },
      {
        name: 'About', slug: 'about',
        sections: [
          AGENT_HEADER,
          { name: 'Story', blockType: 'split-content', fields: {
            headings: ['The Upstate changed street by street. I watched it happen.'],
            text: [
              'I started at fifteen, helping my parents fix up homes across the Upstate. For most of my career I worked the investment side — buying, renovating, running the numbers on what a property is genuinely worth once the work is done.',
              'I\'ve lived in South Carolina my whole life. That\'s the part I bring to the table: not just what a home is listed at, but what it\'s likely to do for you.',
              'Buying or selling is one of the more stressful things you\'ll go through. I\'d rather be the person you can ask a stupid question at nine at night than the one who disappears after the closing table.',
            ],
          } },
          { name: 'Timeline', blockType: 'timeline', fields: {
            eyebrow: 'Who you\'re actually calling',
            headings: ['The short version.'],
            items: [
              { meta: 'AGE 15', body: 'First renovation — working alongside my parents on Upstate homes.' },
              { meta: 'THEN', body: 'Years on the investment side, learning what actually adds value and what just photographs well.' },
              { meta: 'NOW', body: 'Licensed SC agent (#146507) with Keller Williams Greenville Upstate, backed by an experienced team on every deal.' },
              { meta: 'AFTER', body: 'The Black Book and the homeowner portal — because my job doesn\'t end when yours starts.' },
            ],
          } },
          { name: 'CTA', blockType: 'cta-band', fields: {
            headings: ['Ask me anything about the Upstate.'],
            links: [{ href: '/start', label: 'Start my search' }, { href: 'tel:8643809582', label: 'Call or text' }],
          } },
          AGENT_FOOTER,
          FURNITURE_STICKY,
        ],
      },
      {
        name: 'Upstate notes', slug: 'notes',
        sections: [
          AGENT_HEADER,
          { name: 'Notes', blockType: 'blog-cards', fields: {
            headings: ['Read before you sign anything.'],
            items: NOTES,
          } },
          { name: 'CTA', blockType: 'cta-band', fields: {
            headings: ['Questions the guides didn\'t answer?'],
            links: [{ href: '/start', label: 'Start my search' }],
          } },
          AGENT_FOOTER,
          FURNITURE_STICKY,
        ],
      },
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
