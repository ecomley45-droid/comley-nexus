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

  // --- Navigation bars ------------------------------------------------------
  //
  // All five share a brand mark, a link row and an optional call to action.
  // The logo is `images[0]`; with none set the site name renders as a
  // wordmark, so a bar is never empty while someone is still choosing one.
  ...(() => {
    const BRAND = {
      headings: { label: 'Site name', max: 1, hint: 'Used as the wordmark when there’s no logo, and as the logo’s alt text.' },
      images: { label: 'Logo', max: 1, hint: 'Optional. Falls back to the site name.' },
      links: { ...NAV_LINKS, label: 'Navigation links' },
    };
    const BRAND_EXTRAS = {
      logoHeight: { kind: 'number', label: 'Logo height (px)', min: 16, max: 72, placeholder: '32' },
      ctaLabel: { kind: 'text', label: 'Button label', placeholder: 'Get in touch', hint: 'Leave empty for no button.' },
      ctaHref: { kind: 'text', label: 'Button link', placeholder: '/contact' },
      homeHref: { kind: 'text', label: 'Logo links to', placeholder: '/' },
    };
    const STICKY = {
      sticky: { kind: 'boolean', label: 'Stick to the top when scrolling' },
    };
    return {
      'nav-logo': {
        order: ['headings', 'images', 'links', 'logoHeight', 'ctaLabel', 'ctaHref', 'sticky', 'homeHref'],
        ...BRAND,
        extras: { ...BRAND_EXTRAS, ...STICKY },
      },
      'nav-center': {
        order: ['headings', 'images', 'links', 'logoHeight', 'sticky', 'homeHref'],
        ...BRAND,
        links: { ...NAV_LINKS, label: 'Navigation links', hint: 'Split either side of the logo — the first half left, the rest right.' },
        extras: { ...BRAND_EXTRAS, ...STICKY },
      },
      'nav-utility': {
        order: ['headings', 'images', 'links', 'text', 'items', 'logoHeight', 'ctaLabel', 'ctaHref', 'sticky', 'homeHref'],
        ...BRAND,
        text: { label: 'Top strip text', singular: 'line', max: 2, placeholder: 'Serving the Upstate since 2009' },
        items: {
          label: 'Top strip links', singular: 'link', max: 4,
          use: ['heading', 'link'],
          labels: { heading: 'Label', link: 'Link' },
          placeholders: { heading: '(864) 380-9582', link: 'tel:8643809582' },
        },
        extras: { ...BRAND_EXTRAS, ...STICKY },
      },
      'nav-overlay': {
        order: ['headings', 'images', 'links', 'logoHeight', 'ctaLabel', 'ctaHref', 'solidAfter', 'homeHref'],
        ...BRAND,
        images: {
          label: 'Logo', max: 2,
          hint: 'First is the normal logo. Add a second, light version and it’s used while the bar is transparent over the hero.',
        },
        extras: {
          ...BRAND_EXTRAS,
          solidAfter: {
            kind: 'number', label: 'Turn solid after (px scrolled)', min: 0, max: 2000, placeholder: '80',
          },
        },
      },
      'nav-drawer': {
        order: ['headings', 'images', 'links', 'logoHeight', 'ctaLabel', 'ctaHref', 'sticky', 'homeHref'],
        ...BRAND,
        extras: { ...BRAND_EXTRAS, ...STICKY },
      },
    };
  })(),
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
  'virtual-tour': {
    order: ['headings', 'text', 'tourUrl', 'height', 'caption'],
    headings: { label: 'Heading', max: 1 },
    text: { ...BODY_TEXT, max: 1, label: 'Intro' },
    extras: {
      tourUrl: { kind: 'text', label: 'Tour link or embed code', placeholder: 'https://my.matterport.com/show/?m=…', hint: 'Paste the share link — or the whole embed snippet — from Matterport, Kuula, CloudPano, Momento360, iGuide or Panoee.' },
      height: { kind: 'number', label: 'Height (px)', min: 280, max: 900, placeholder: '520' },
      caption: { kind: 'text', label: 'Caption', placeholder: 'Drag to look around' },
    },
  },
  'model-3d': {
    order: ['headings', 'modelUrl', 'poster', 'alt', 'rotate', 'interact', 'ar', 'iosUrl', 'bg', 'bgColor', 'height', 'caption'],
    headings: { label: 'Heading', max: 1 },
    extras: {
      modelUrl: { kind: 'model', accept: 'glb', label: '3D model (.glb)', hint: 'Pick from your media library or paste a URL. Not sure where to get one? Phone-scanning apps like Polycam export .glb files.' },
      poster: { kind: 'image', label: 'Poster image', hint: 'Shown until someone taps. The 3D viewer only loads on interaction, so a poster keeps the page fast.' },
      alt: { kind: 'text', label: 'Describe the model', placeholder: 'A mid-century lounge chair', hint: 'Read aloud by screen readers.' },
      rotate: { kind: 'boolean', label: 'Spin it automatically' },
      interact: { kind: 'boolean', label: 'Let visitors rotate and zoom' },
      ar: { kind: 'boolean', label: 'Let visitors view it in their space (AR)', hint: 'On a phone, opens the model in the room through the camera.' },
      iosUrl: { kind: 'model', accept: 'usdz', label: 'iPhone AR file (.usdz)', hint: 'Optional. iPhones need a .usdz for AR — without one, AR still works on Android.' },
      bg: { kind: 'select', label: 'Background', options: [{ value: 'transparent', label: 'Transparent' }, { value: 'surface', label: 'Theme surface' }, { value: 'color', label: 'Custom colour' }] },
      bgColor: { kind: 'text', label: 'Background colour', placeholder: '#f2f3f7' },
      height: { kind: 'number', label: 'Height (px)', min: 240, max: 900, placeholder: '480' },
      caption: { kind: 'text', label: 'Caption', placeholder: 'Drag to rotate' },
    },
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
  'hero-video': {
    order: ['eyebrow', 'headings', 'text', 'links', 'videoUrl', 'images', 'buttonLabel'],
    headings: { label: 'Headline', max: 1 },
    text: BODY_TEXT,
    links: { ...BUTTONS, hint: 'The first is the main button; the second renders as an outline.' },
    images: { label: 'Poster image', max: 1, hint: 'Shown before the video loads. With no video and no poster, an animated gradient fills the space.' },
    extras: {
      eyebrow: { kind: 'text', label: 'Kicker', placeholder: 'Greenville · Greer · Travelers Rest' },
      videoUrl: {
        kind: 'text', label: 'Background video (.mp4)', placeholder: 'https://…/hero.mp4',
        hint: 'Muted and looped. Skipped automatically on metered connections and for visitors who prefer reduced motion.',
      },
      buttonLabel: { kind: 'text', label: 'Scroll hint', placeholder: 'Four questions, thirty seconds' },
    },
  },
  'sticky-cta': {
    order: ['links', 'buttonLabel'],
    links: { ...BUTTONS, max: 2, label: 'Buttons', hint: 'The first fills the bar; an optional second sits beside it.' },
    extras: {
      buttonLabel: {
        kind: 'text', label: 'Hide when this is on screen', placeholder: '#search',
        hint: 'A CSS selector. The bar retracts while that element is visible — no point floating "Start" over the form itself.',
      },
    },
  },
  'scroll-progress': {
    order: ['limit'],
    extras: { limit: { kind: 'number', label: 'Bar height (px)', min: 1, max: 8, placeholder: '2' } },
  },

  // --- Editorial set --------------------------------------------------------
  'numbered-index': {
    order: ['eyebrow', 'headings', 'text', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: {
      label: 'Entries', singular: 'entry',
      use: ['heading', 'meta'],
      labels: { heading: 'Name', meta: 'Note (optional)' },
      hint: 'Numbered automatically, in the order listed.',
    },
    extras: { eyebrow: { kind: 'text', label: 'Kicker', placeholder: 'The part that starts after closing' } },
  },
  'swatch-cards': {
    order: ['eyebrow', 'headings', 'text', 'items', 'buttonLabel'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: {
      label: 'Cards', singular: 'card',
      use: ['heading', 'link', 'body', 'meta'],
      labels: { heading: 'Title', link: 'Label above the title', body: 'Description', meta: 'Bar colour' },
      placeholders: { link: 'Warranties', meta: '#C08A2E' },
    },
    extras: {
      eyebrow: { kind: 'text', label: 'Kicker', placeholder: 'Coming soon' },
      buttonLabel: { kind: 'text', label: 'Status line', placeholder: 'In development' },
    },
  },
  timeline: {
    order: ['eyebrow', 'headings', 'text', 'items'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    items: {
      label: 'Milestones', singular: 'milestone',
      use: ['meta', 'body'],
      labels: { meta: 'Label', body: 'What happened' },
      placeholders: { meta: 'AGE 15' },
    },
    extras: { eyebrow: { kind: 'text', label: 'Kicker', placeholder: "Who you're calling" } },
  },
  'lead-form': {
    order: ['headings', 'items', 'buttonLabel', 'placeholder', 'consent'],
    headings: { label: 'Form name', max: 1, hint: 'Shown on the card and used to label responses in your Forms inbox.' },
    items: {
      label: 'Questions', singular: 'question',
      use: ['heading', 'link', 'body', 'meta', 'image'],
      labels: {
        heading: 'Question', link: 'Helper text', body: 'Choices, comma separated',
        meta: 'single or multi', image: 'Field name in your inbox',
      },
      placeholders: { heading: 'What brings you here?', body: 'Buying, Selling, Both', meta: 'single', image: 'intent' },
      hint: 'One step per question. The contact step is always added last.',
    },
    extras: {
      buttonLabel: { kind: 'text', label: 'Contact step heading', placeholder: 'Where should I send them?' },
      placeholder: { kind: 'text', label: 'Contact step helper', placeholder: "You'll hear from a person." },
      consent: { kind: 'text', label: 'Consent wording' },
    },
  },

  search: {
    order: ['headings', 'placeholder', 'buttonLabel'],
    headings: { label: 'Heading' },
    extras: {
      placeholder: { kind: 'text', label: 'Placeholder', placeholder: 'Search this site…' },
      buttonLabel: { ...BUTTON_LABEL, placeholder: 'Search' },
    },
  },
  'language-switcher': {
    order: ['style'],
    extras: {
      style: {
        kind: 'select', label: 'Style',
        options: [{ value: 'inline', label: 'Centred row' }, { value: 'dropdown', label: 'Right-aligned' }],
        hint: 'The languages themselves come from Design settings, so every switcher on the site stays in step.',
      },
      // Filled in at serve time from the site's locales, not authored here.
      locales: { kind: 'serverFilled', label: 'Languages' },
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

  // --- Property listings ----------------------------------------------------
  //
  // `listings` and `facets` are filled server-side from the bound collection,
  // so they are deliberately absent here: they aren't authored, and showing
  // them as editable fields would invite someone to type a listing into a
  // block instead of into the collection where it belongs.
  'listing-cards': {
    order: ['headings', 'text', 'collectionSlug', 'limit', 'tagLimit', 'emptyText'],
    headings: { label: 'Heading' },
    text: BODY_TEXT,
    extras: {
      collectionSlug: {
        kind: 'collection', label: 'Listings collection',
        hint: 'Pick a collection built from the Property listings preset.',
      },
      limit: { kind: 'number', label: 'Listings to show', min: 1, max: 60, placeholder: 'All' },
      tagLimit: {
        kind: 'number', label: 'Feature tags per card', min: 0, max: 8, placeholder: '3',
        hint: 'Keeps a home with twenty amenities from towering over its neighbours in the grid.',
      },
      emptyText: {
        kind: 'text', label: 'Text when there are no listings',
        placeholder: 'No listings yet.',
      },
      mapping: { kind: 'collectionMapping', label: 'Field mapping' },
    },
  },
  'listing-search': {
    order: ['collectionSlug', 'placeholder', 'showMap', 'emptyText'],
    extras: {
      collectionSlug: {
        kind: 'collection', label: 'Listings collection',
        hint: 'Every published entry is searchable. Filters build themselves from what the listings actually contain.',
      },
      placeholder: { kind: 'text', label: 'Search box hint', placeholder: 'Search by address, city, or MLS #' },
      showMap: {
        kind: 'boolean', label: 'Show map',
        hint: 'Listings need latitude and longitude to appear as pins.',
      },
      emptyText: { kind: 'text', label: 'Text when there are no listings', placeholder: 'No listings yet.' },
      mapping: { kind: 'collectionMapping', label: 'Field mapping' },
    },
  },
  'listing-hero': {
    order: [],
    extras: {},
  },
  'listing-facts': {
    order: ['headings'],
    headings: { label: 'Heading', max: 1 },
  },
  'listing-features': {
    order: ['headings'],
    headings: { label: 'Heading', max: 1 },
  },
  'mortgage-calculator': {
    order: ['headings', 'text', 'defaultPrice', 'downPercent', 'ratePercent', 'termYears'],
    headings: { label: 'Heading', max: 1 },
    text: { ...BODY_TEXT, max: 1, label: 'Disclaimer' },
    extras: {
      defaultPrice: {
        kind: 'number', label: 'Price when not on a listing', min: 0, placeholder: '350000',
        hint: 'On a listing page the home’s own price is used instead.',
      },
      downPercent: { kind: 'number', label: 'Starting down payment (%)', min: 0, max: 100, placeholder: '20' },
      ratePercent: { kind: 'number', label: 'Starting interest rate (%)', min: 0, max: 30, placeholder: '6.5' },
      termYears: { kind: 'number', label: 'Starting term (years)', min: 1, max: 50, placeholder: '30' },
    },
  },
  'price-history': {
    order: ['headings'],
    headings: { label: 'Heading', max: 1 },
  },
  'nearby-schools': {
    order: ['headings', 'text'],
    headings: { label: 'Heading', max: 1 },
    text: { ...BODY_TEXT, max: 1, label: 'Note' },
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
