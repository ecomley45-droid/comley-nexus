// What the Content panel shows for each block type.
//
// Every renderer in blockRenderers.js reads a specific, small set of fields
// -- renderNavigation only ever touches `links`, renderStatBand only ever
// touches `items`. The structured editor used to show the same four generic
// editors (Headings / Paragraphs / Images / Links) for all of them, which
// meant two bad outcomes for a no-code user: fields that do nothing when you
// fill them in, and fields the block genuinely uses that were never offered
// at all (a Contact Form's button label, a Social Feed's platform).
//
// This module is the bridge: for each blockType it declares exactly which
// editors to render, in what order, and with labels that name what the field
// does *in that block* -- "Question"/"Answer" on an FAQ, "Number"/"Label" on
// a stat, "Step title" on a step. Anything not declared is not shown.
//
// Keeping it beside the renderers is deliberate: when a renderer starts
// reading a new field, its entry here is the one other place to touch.
// `npm run audit:blocks` (scripts/auditBlockFields.mjs) walks BLOCK_RENDERERS,
// extracts the fields each one actually reads, and fails if any of them has
// no editor here -- so the two can't drift silently.
//
// `order` lists section keys in display order. Standard keys are
// headings/text/images/links/items/plans; anything else is an "extra"
// declared in `extras` and addressed by the same key.

// ---------------------------------------------------------------------------
// Shared item-field label sets, so the same semantic shape reads the same way
// wherever it appears.
// ---------------------------------------------------------------------------

const CARD_ITEM = {
  use: ['heading', 'meta', 'body', 'image', 'link'],
  labels: {
    heading: 'Title', meta: 'Subtitle', body: 'Description',
    image: 'Image URL', link: 'Link URL',
  },
};

const PERSON_ITEM = {
  use: ['heading', 'meta', 'body', 'image'],
  labels: { heading: 'Name', meta: 'Role or company', body: 'Quote or bio', image: 'Photo URL' },
};

const QA_ITEM = {
  use: ['heading', 'body'],
  labels: { heading: 'Question', body: 'Answer' },
};

const STAT_ITEM = {
  use: ['heading', 'body'],
  labels: { heading: 'Number', body: 'Label' },
  placeholders: { heading: '120+', body: 'Projects shipped' },
};

const SIMPLE_ITEM = {
  use: ['heading', 'body'],
  labels: { heading: 'Title', body: 'Description' },
};

// Reusable field descriptors.
const HEADLINE = { label: 'Headline', hint: 'The first heading is the largest.' };
const BODY_TEXT = { label: 'Body text', singular: 'paragraph' };
const NAV_LINKS = { label: 'Links', labelPlaceholder: 'Home', hrefPlaceholder: '/about' };
const BUTTONS = { label: 'Buttons', labelPlaceholder: 'Get started', hrefPlaceholder: '/contact' };
const ONE_BUTTON = { ...BUTTONS, label: 'Button', max: 1, hint: 'Only the first link renders, as the button.' };

const BUTTON_LABEL = { kind: 'text', label: 'Button label', placeholder: 'Send message' };
const VIDEO_URL = { kind: 'text', label: 'Video URL', placeholder: 'https://www.youtube.com/watch?v=…', hint: 'YouTube or Vimeo links are converted to embeds automatically.' };

// ---------------------------------------------------------------------------
// Per-block schemas
// ---------------------------------------------------------------------------

export const BLOCK_FIELDS = {
  // --- Structure -----------------------------------------------------------
  header: {
    order: ['headings', 'links'],
    headings: { label: 'Site name', max: 1, hint: 'Shown on the left of the header bar.' },
    links: { ...NAV_LINKS, label: 'Navigation links' },
  },
  navigation: {
    order: ['links'],
    links: { ...NAV_LINKS, label: 'Navigation links' },
  },
  footer: {
    order: ['text', 'links'],
    text: { label: 'Footer text', singular: 'line', placeholder: '© 2026 Your company' },
    links: { ...NAV_LINKS, label: 'Footer links' },
  },
  breadcrumb: {
    order: ['links'],
    links: { label: 'Trail', labelPlaceholder: 'Home', hrefPlaceholder: '/', hint: 'Each link is one step in the trail, in order.' },
  },
  announcement: {
    order: ['text', 'links'],
    text: { label: 'Message', max: 1, placeholder: 'Free shipping on orders over $50' },
    links: { ...ONE_BUTTON, label: 'Link' },
  },

  // --- Hero / CTA ----------------------------------------------------------
  hero: {
    order: ['headings', 'text', 'links'],
    headings: HEADLINE,
    text: BODY_TEXT,
    links: ONE_BUTTON,
  },
  'hero-centered': {
    order: ['headings', 'text', 'links', 'images'],
    headings: HEADLINE,
    text: BODY_TEXT,
    links: BUTTONS,
    images: { label: 'Background image', max: 1 },
  },
  'hero-split': {
    order: ['headings', 'text', 'links', 'images'],
    headings: HEADLINE,
    text: BODY_TEXT,
    links: BUTTONS,
    images: { label: 'Side image', max: 1 },
  },
  cta: {
    order: ['headings', 'text', 'links'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    links: BUTTONS,
  },
  'cta-band': {
    order: ['headings', 'text', 'links'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    links: BUTTONS,
  },
  'cta-split': {
    order: ['headings', 'text', 'links'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    links: BUTTONS,
  },
  banner: {
    order: ['headings', 'text', 'images', 'links'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    images: { label: 'Background image', max: 1, hint: 'Rendered behind the text at reduced opacity.' },
    links: { ...ONE_BUTTON, label: 'Link' },
  },
  'banner-image': {
    order: ['headings', 'text', 'images', 'links'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    images: { label: 'Background image', max: 1 },
    links: BUTTONS,
  },
  parallax: {
    order: ['headings', 'text', 'images', 'links', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    images: { label: 'Background image', max: 1, hint: 'Stays fixed while the page scrolls past it.' },
    links: BUTTONS,
    items: { ...SIMPLE_ITEM, label: 'Panels', singular: 'panel' },
  },

  // --- Content -------------------------------------------------------------
  feature: {
    order: ['headings', 'text'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
  },
  content: {
    order: ['headings', 'text', 'images', 'links'],
    headings: { label: 'Headings' },
    text: BODY_TEXT,
    images: { label: 'Images' },
    links: { label: 'Links' },
  },
  'split-content': {
    order: ['headings', 'text', 'images', 'links'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    images: { label: 'Side image', max: 1 },
    links: BUTTONS,
  },
  quote: {
    order: ['text', 'headings', 'items'],
    text: { label: 'Quote', max: 1, hint: 'The pull quote itself.', placeholder: 'This changed how our team works.' },
    // renderQuote falls back to headings[0] when Quote is empty, which is how
    // a pasted-in quote usually arrives. Hidden unless it actually holds
    // something, so authored blocks aren't offered a field that does nothing.
    headings: { label: 'Quote (imported)', max: 1, showWhenPresent: true, hint: 'Used as the quote while the field above is empty. Move the text up to retire this.' },
    items: {
      label: 'Attribution', singular: 'person', max: 1,
      use: ['heading', 'meta', 'image'],
      labels: { heading: 'Name', meta: 'Role or company', image: 'Photo URL' },
    },
  },
  checklist: {
    order: ['headings', 'text', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: { ...SIMPLE_ITEM, label: 'Checklist items', singular: 'item' },
  },
  steps: {
    order: ['headings', 'text', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: {
      label: 'Steps', singular: 'step',
      use: ['heading', 'body'],
      labels: { heading: 'Step title', body: 'What happens in this step' },
      hint: 'Numbered automatically in the order listed.',
    },
  },
  'feature-icons': {
    order: ['headings', 'text', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: {
      label: 'Features', singular: 'feature',
      use: ['heading', 'body'],
      labels: { heading: 'Feature name', body: 'Description' },
      hint: "Each feature's icon is the first letter of its name.",
    },
  },
  'feature-rows': {
    order: ['items'],
    items: {
      label: 'Rows', singular: 'row',
      use: ['heading', 'body', 'image'],
      labels: { heading: 'Title', body: 'Description', image: 'Image URL' },
      hint: 'Rows alternate image left / image right down the page.',
    },
  },
  list: {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...CARD_ITEM, label: 'List items', singular: 'item' },
  },
  'card-grid': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...CARD_ITEM, label: 'Cards', singular: 'card' },
  },
  'scrolling-cards': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...CARD_ITEM, label: 'Cards', singular: 'card', hint: 'Scroll sideways on the published page.' },
  },
  'blog-cards': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: {
      label: 'Posts', singular: 'post',
      use: ['heading', 'meta', 'body', 'image', 'link'],
      labels: { heading: 'Post title', meta: 'Date or category', body: 'Excerpt', image: 'Cover image URL', link: 'Post URL' },
    },
  },
  tabs: {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: {
      label: 'Tabs', singular: 'tab',
      use: ['heading', 'body'],
      labels: { heading: 'Tab label', body: 'Tab content' },
    },
  },
  faq: {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...QA_ITEM, label: 'Questions', singular: 'question' },
  },
  'faq-accordion': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...QA_ITEM, label: 'Questions', singular: 'question', hint: 'Each row expands on click — no JavaScript needed.' },
  },

  // --- Social proof --------------------------------------------------------
  stats: {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...STAT_ITEM, label: 'Statistics', singular: 'statistic' },
  },
  'stat-band': {
    order: ['items'],
    items: { ...STAT_ITEM, label: 'Statistics', singular: 'statistic' },
  },
  'metric-cards': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: {
      label: 'Metrics', singular: 'metric',
      use: ['heading', 'body', 'meta'],
      labels: { heading: 'Number', body: 'Label', meta: 'Small print' },
      placeholders: { heading: '98%', body: 'Customer retention', meta: 'Last 12 months' },
    },
  },
  testimonials: {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...PERSON_ITEM, label: 'Testimonials', singular: 'testimonial' },
  },
  'testimonial-grid': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...PERSON_ITEM, label: 'Testimonials', singular: 'testimonial' },
  },
  'testimonial-marquee': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: { ...PERSON_ITEM, label: 'Testimonials', singular: 'testimonial', hint: 'Scroll continuously across the page.' },
  },
  team: {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: {
      label: 'People', singular: 'person',
      use: ['heading', 'meta', 'body', 'image', 'link'],
      labels: { heading: 'Name', meta: 'Job title', body: 'Bio', image: 'Photo URL', link: 'Profile URL' },
    },
  },
  'team-grid': {
    order: ['headings', 'items'],
    headings: { label: 'Heading' },
    items: {
      label: 'People', singular: 'person',
      use: ['heading', 'meta', 'body', 'image'],
      labels: { heading: 'Name', meta: 'Job title', body: 'Bio', image: 'Photo URL' },
    },
  },
  'logo-cloud': {
    order: ['headings', 'images'],
    headings: { label: 'Heading' },
    images: { label: 'Logos', hint: 'Rendered small and desaturated.' },
  },
  'logo-marquee': {
    order: ['headings', 'images'],
    headings: { label: 'Heading' },
    images: { label: 'Logos', hint: 'Scroll continuously across the page.' },
  },

  // --- Conversion ----------------------------------------------------------
  'pricing-table': {
    order: ['headings', 'plans'],
    headings: { label: 'Heading' },
    plans: { label: 'Plans' },
  },
  'pricing-cards': {
    order: ['headings', 'text', 'plans'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    plans: { label: 'Plans' },
  },
  'price-list': {
    order: ['headings', 'text', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: {
      label: 'Price rows', singular: 'row',
      use: ['heading', 'meta', 'body'],
      labels: { heading: 'Item', meta: 'Price', body: 'Description' },
      placeholders: { heading: 'Diagnostic visit', meta: '$89', body: 'Applied to the job if you book with us.' },
    },
  },
  form: {
    order: ['headings', 'text', 'formFields', 'buttonLabel'],
    headings: { label: 'Heading', hint: 'Also names this form in your Forms inbox.' },
    text: BODY_TEXT,
    extras: {
      formFields: {
        kind: 'formFields', label: 'Fields',
        hint: 'Submissions land in Forms. New fields show up there automatically.',
      },
      buttonLabel: BUTTON_LABEL,
    },
  },
  newsletter: {
    order: ['headings', 'text', 'buttonLabel'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    extras: { buttonLabel: { ...BUTTON_LABEL, placeholder: 'Subscribe' } },
  },
  'contact-split': {
    order: ['headings', 'text', 'links'],
    headings: { label: 'Heading' },
    text: { label: 'Contact details', singular: 'line', placeholder: 'hello@example.com' },
    links: { label: 'Links', labelPlaceholder: 'Directions', hrefPlaceholder: 'https://…' },
  },
  countdown: {
    order: ['headings', 'text', 'targetDate'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    extras: { targetDate: { kind: 'date', label: 'Counts down to' } },
  },
  product: {
    order: ['headings', 'text', 'productId', 'price', 'buttonLabel', 'image'],
    headings: { label: 'Product name', max: 1 },
    text: { label: 'Description', singular: 'paragraph' },
    extras: {
      productId: {
        kind: 'text', label: 'Product ID', placeholder: "Paste the product's ID",
        hint: 'From Commerce › Products. Without it the Buy button is inactive.',
      },
      price: { kind: 'text', label: 'Displayed price', placeholder: '$29' },
      buttonLabel: { ...BUTTON_LABEL, placeholder: 'Buy now' },
      image: { kind: 'image', label: 'Product image' },
    },
  },

  // --- Media ---------------------------------------------------------------
  image: {
    order: ['images'],
    images: { label: 'Image', max: 1 },
  },
  gallery: {
    order: ['headings', 'images'],
    headings: { label: 'Heading' },
    images: { label: 'Images' },
  },
  'gallery-masonry': {
    order: ['headings', 'images'],
    headings: { label: 'Heading' },
    images: { label: 'Images', hint: 'Laid out in staggered columns.' },
  },
  'flyer-slider': {
    order: ['headings', 'images'],
    headings: { label: 'Heading' },
    images: { label: 'Slides', hint: 'One image per slide, swipeable on the published page.' },
  },
  video: {
    order: ['headings', 'videoUrl'],
    headings: { label: 'Heading' },
    extras: { videoUrl: VIDEO_URL },
  },
  'video-split': {
    order: ['headings', 'text', 'videoUrl', 'links'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    links: BUTTONS,
    extras: { videoUrl: VIDEO_URL },
  },
  'video-bg': {
    order: ['headings', 'text', 'videoUrl', 'images', 'links'],
    headings: HEADLINE,
    text: BODY_TEXT,
    images: { label: 'Poster image', max: 1, hint: 'Shown before the video loads.' },
    links: BUTTONS,
    extras: {
      videoUrl: { kind: 'text', label: 'Background video (.mp4)', placeholder: 'https://…/clip.mp4', hint: 'Plays muted and looped behind the text.' },
    },
  },

  // --- Interactive / data-bound -------------------------------------------
  'social-links': {
    order: ['links'],
    links: {
      label: 'Profiles', labelPlaceholder: 'Instagram', hrefPlaceholder: 'https://instagram.com/…',
      hint: 'The label picks the icon — Instagram, Facebook, X, LinkedIn, YouTube, TikTok.',
    },
  },
  'social-feed': {
    order: ['headings', 'platform', 'limit'],
    headings: { label: 'Heading', max: 1 },
    extras: {
      platform: {
        kind: 'select', label: 'Account',
        options: [
          { value: 'ig', label: 'Instagram' },
          { value: 'fb', label: 'Facebook' },
          { value: 'x', label: 'X / Twitter' },
          { value: 'li', label: 'LinkedIn' },
        ],
        hint: 'Pulls live posts from the matching connected account at publish time.',
      },
      limit: { kind: 'number', label: 'Posts to show', min: 1, max: 12, placeholder: '6' },
    },
  },
  'collection-list': {
    order: ['headings', 'text', 'collectionSlug', 'layout', 'limit'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    extras: {
      collectionSlug: {
        kind: 'collection', label: 'Collection',
        hint: 'Entries stay in sync — edit them once under Content and every block using them updates.',
      },
      layout: {
        kind: 'select', label: 'Layout',
        options: [
          { value: 'cards', label: 'Cards' },
          { value: 'list', label: 'List' },
          { value: 'posts', label: 'Blog posts' },
          { value: 'people', label: 'People' },
          { value: 'gallery', label: 'Gallery' },
        ],
      },
      limit: { kind: 'number', label: 'Entries to show', min: 1, max: 60, placeholder: 'All' },
      // Edited inside the collection picker above, not as a field of its own.
      mapping: { kind: 'collectionMapping', label: 'Field mapping' },
    },
  },

  'events-list': {
    order: ['headings', 'text', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: {
      label: 'Events', singular: 'event',
      use: ['heading', 'meta', 'body', 'link'],
      labels: { heading: 'Event name', meta: 'Date', body: 'Details', link: 'Details URL' },
      placeholders: { meta: 'Sat 14 Mar, 7pm' },
    },
  },
  calendar: {
    order: ['headings', 'month', 'items'],
    headings: { label: 'Heading' },
    items: {
      label: 'Dates', singular: 'date',
      use: ['heading', 'meta'],
      labels: { heading: 'What is on', meta: 'Date (YYYY-MM-DD)' },
      placeholders: { heading: 'Open mic night', meta: '2026-03-14' },
    },
    extras: { month: { kind: 'month', label: 'Month to show' } },
  },
};

// Blocks with a dedicated editor component of their own — the generic
// schema-driven renderer skips these entirely.
export const CUSTOM_EDITOR_TYPES = ['layout', 'script'];

// Block types that can bind to a workspace calendar instead of manual items.
// (Mirrors EVENT_BOUND_TYPES in src/shared/eventsMap.js.)
export const DEFAULT_ORDER = ['headings', 'text', 'images', 'links', 'items', 'plans'];

// Fallback for anything not listed above: a workspace's own custom catalog
// block, or a block type added to the renderers before its schema. Shows
// every generic editor, which is what the editor did for all blocks before
// this file existed -- never fewer fields than before, just fewer irrelevant
// ones where we know better.
export const GENERIC_SCHEMA = {
  order: DEFAULT_ORDER,
  headings: { label: 'Headings' },
  text: { label: 'Paragraphs', singular: 'paragraph' },
  images: { label: 'Images' },
  links: { label: 'Links' },
  items: { ...CARD_ITEM, label: 'Items', singular: 'item' },
  plans: { label: 'Plans' },
};

export function schemaFor(blockType) {
  return BLOCK_FIELDS[blockType] || GENERIC_SCHEMA;
}

// True when the block type has a hand-written editor instead of the
// schema-driven one.
export function hasCustomEditor(blockType) {
  return CUSTOM_EDITOR_TYPES.includes(blockType);
}
