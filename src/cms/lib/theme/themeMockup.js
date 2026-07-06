// Builds a small fixed fake page (Hero + Feature Grid + CTA) rendered
// through the exact same compilePageHtml/blockRenderers pipeline real pages
// use, so the theme wizard's live preview is byte-for-byte how a real page
// with those blocks would actually look -- no separate preview-only styling
// to keep in sync.

import { compilePageHtml } from '../../../shared/compilePage.js';
import { renderBlock } from '../pasteIn/blockRenderers.js';

const HERO_FIELDS = {
  headings: ['Welcome to your new site'],
  text: ['This is a live preview -- pick colors and fonts on the left to see them applied here.'],
  links: [{ href: '#', label: 'Get started' }],
};

const FEATURE_FIELDS = {
  headings: ['Everything you need'],
  items: [
    { heading: 'Fast', body: 'Ships in minutes, not weeks.' },
    { heading: 'Flexible', body: 'Structured fields or raw HTML -- your choice.' },
    { heading: 'Secure', body: 'Sanitized by default, no exceptions.' },
  ],
};

const CTA_FIELDS = {
  headings: ['Ready when you are.'],
  text: ['Get started in minutes.'],
  links: [{ href: '#', label: 'Get started' }],
};

function mockSection(id, blockType, fields) {
  return { id, blockType, fields, html: renderBlock(blockType, fields) || '' };
}

export function buildMockupHtml(theme) {
  const page = {
    id: 'mock-page',
    name: 'Preview',
    content: [
      mockSection('mock-hero', 'hero', HERO_FIELDS),
      mockSection('mock-features', 'card-grid', FEATURE_FIELDS),
      mockSection('mock-cta', 'cta', CTA_FIELDS),
    ],
    layout: { useGlobalHeader: false, useGlobalFooter: false },
  };
  const globalSettings = { theme };
  return compilePageHtml(page, [page], [], globalSettings);
}
