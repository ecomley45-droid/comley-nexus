// Friendly names for the "Blocks included" list on a template's detail page.
// The block list is DERIVED from the template payload (never stored), so this
// maps each blockType to a human label. Unknown types fall back to a
// title-cased version of the type so a new block never shows up blank.
export const BLOCK_LABELS = {
  header: 'Header', navigation: 'Navigation', footer: 'Footer', breadcrumb: 'Breadcrumb',
  hero: 'Hero', banner: 'Banner', content: 'Rich text', feature: 'Feature',
  'card-grid': 'Card grid', 'scrolling-cards': 'Scrolling cards', list: 'List',
  stats: 'Stats', 'logo-cloud': 'Logo cloud', testimonials: 'Testimonials', team: 'Team',
  cta: 'Call to action', 'pricing-table': 'Pricing table', form: 'Contact form',
  newsletter: 'Newsletter', image: 'Image', gallery: 'Gallery', video: 'Video',
  faq: 'FAQ', tabs: 'Tabs', countdown: 'Countdown', 'social-links': 'Social links',
  product: 'Product',
  // Polished block set
  'hero-split': 'Split hero', 'split-content': 'Image + text', 'feature-icons': 'Feature tiles',
  steps: 'How it works', 'price-list': 'Price list', 'stat-band': 'Stat band',
  quote: 'Pull quote', 'cta-band': 'CTA band',
};

export function labelForBlock(blockType) {
  return BLOCK_LABELS[blockType]
    || String(blockType || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
