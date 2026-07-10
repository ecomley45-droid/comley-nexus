// Builds a fully-populated demo workspace: a themed multi-page site (block
// pages + one full-custom HTML page), reusable library blocks, media, form
// submissions, ~30 days of analytics, a newsletter template + campaigns, and
// a live deployment so the public site is up. Used by the seed script
// (db/seeds/demoWorkspace.mjs) and the Super Admin "Create demo workspace"
// button. Idempotent: re-running with reset=true wipes and rebuilds the org.

import { db } from './db.js';
import * as storage from './storage.js';
import * as deployments from './deployments.js';
import * as emailTemplates from './email/templates.js';
import * as emailCampaigns from './email/campaigns.js';
import { STARTER_TEMPLATES } from './email/blocks.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

const rid = (p) => `${p}-${Math.random().toString(16).slice(2, 10)}`;

// One page from a list of [blockType, fields] plus a header + footer, each
// section carrying real block fields (so it opens as editable blocks) and its
// rendered html (what compilePage serves).
function blockPage({ id, name, slug, status = 'published', blocks }) {
  const header = ['header', { headings: ['Northwind & Co'], links: [{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }, { href: '/services', label: 'Services' }, { href: '/contact', label: 'Contact' }] }];
  const footer = ['footer', { text: ['© 2026 Northwind & Co. All rights reserved.'], links: [{ href: '/privacy', label: 'Privacy' }, { href: '/contact', label: 'Contact' }] }];
  const section = ([blockType, fields]) => ({ id: rid('sec'), blockType, fields, html: renderBlock(blockType, fields) || '' });
  return {
    id, name, slug, status, editorMode: 'blocks',
    seo: { title: `${name} · Northwind & Co`, description: `${name} page for the Northwind & Co demo site.`, ogImage: '' },
    content: [header, ...blocks, footer].map(section),
  };
}

function demoPages() {
  const home = blockPage({
    id: 'demo-home', name: 'Home', slug: 'index',
    blocks: [
      ['hero', { headings: ['Craft that ships on time'], text: ['Northwind is a design-and-build studio for growing brands. Strategy, sites, and stores — under one roof.'], links: [{ href: '/services', label: 'See our work' }, { href: '/contact', label: 'Start a project' }] }],
      ['card-grid', { headings: ['What we do'], items: [{ heading: 'Brand', body: 'Identity systems that scale from favicon to billboard.' }, { heading: 'Web', body: 'Fast, accessible sites on a CMS your team can actually run.' }, { heading: 'Commerce', body: 'Storefronts that convert, wired to real fulfilment.' }] }],
      ['stats', { headings: ['By the numbers'], items: [{ heading: '120+', body: 'Projects shipped' }, { heading: '4.9/5', body: 'Client rating' }, { heading: '11 yrs', body: 'In business' }] }],
      ['cta', { headings: ['Have something in mind?'], text: ['Tell us about it — we reply within a day.'], links: [{ href: '/contact', label: 'Get in touch' }] }],
    ],
  });
  const about = blockPage({
    id: 'demo-about', name: 'About', slug: 'about',
    blocks: [
      ['content', { headings: ['We’re a small team that punches above its weight'], text: ['Founded in 2015, Northwind pairs senior designers with engineers so nothing gets lost in handoff.', 'We take on a handful of projects at a time and give each the attention it deserves.'] }],
      ['team', { headings: ['The team'], items: [{ heading: 'Ava Restrepo', meta: 'Founder & Design', body: 'Leads brand and art direction.', image: 'https://placehold.co/200x200?text=AR' }, { heading: 'Marcus Lee', meta: 'Engineering', body: 'Owns the build and the CMS.', image: 'https://placehold.co/200x200?text=ML' }, { heading: 'Priya Shah', meta: 'Strategy', body: 'Keeps projects pointed at outcomes.', image: 'https://placehold.co/200x200?text=PS' }] }],
      ['testimonials', { headings: ['Kind words'], items: [{ heading: 'Dana Cole', meta: 'CMO, Fernwood', body: '“They rebuilt our site in six weeks and conversions jumped 30%.”', image: 'https://placehold.co/80x80?text=DC' }, { heading: 'Sam Ortiz', meta: 'Founder, Loop', body: '“The most organised studio we’ve worked with.”', image: 'https://placehold.co/80x80?text=SO' }] }],
    ],
  });
  const services = blockPage({
    id: 'demo-services', name: 'Services', slug: 'services',
    blocks: [
      ['hero', { headings: ['Services & pricing'], text: ['Transparent packages, no surprise invoices.'], links: [{ href: '/contact', label: 'Book a call' }] }],
      ['pricing-table', { headings: ['Pick a starting point'], plans: [{ name: 'Refresh', price: '$4k', period: 'project', features: ['Brand tune-up', 'Up to 5 pages', '2 weeks'], ctaLabel: 'Choose Refresh', ctaHref: '/contact', highlighted: false }, { name: 'Build', price: '$12k', period: 'project', features: ['Full site or store', 'CMS training', '6 weeks'], ctaLabel: 'Choose Build', ctaHref: '/contact', highlighted: true }, { name: 'Partner', price: '$3k', period: '/mo', features: ['Ongoing design + dev', 'Priority support', 'Rolling roadmap'], ctaLabel: 'Choose Partner', ctaHref: '/contact', highlighted: false }] }],
      ['faq', { headings: ['Common questions'], items: [{ heading: 'How fast can you start?', body: 'Usually within two weeks of a signed proposal.' }, { heading: 'Do you offer payment plans?', body: 'Yes — most projects are split into three milestones.' }] }],
    ],
  });
  const contact = blockPage({
    id: 'demo-contact', name: 'Contact', slug: 'contact',
    blocks: [
      ['content', { headings: ['Let’s talk'], text: ['Fill in the form and we’ll get back to you within one business day.'] }],
      ['form', { headings: ['Send us a message'], text: ['We read every submission.'] }],
    ],
  });
  // A full-custom HTML page — the "some full custom" case.
  const custom = {
    id: 'demo-lookbook', name: 'Lookbook (custom HTML)', slug: 'lookbook', status: 'published',
    editorMode: 'full-html',
    seo: { title: 'Lookbook · Northwind & Co', description: 'A hand-built showcase page.', ogImage: '' },
    content: [],
    fullHtml: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lookbook</title>
<style>body{margin:0;font-family:Georgia,serif;background:#0f0e17;color:#fffffe}
.wrap{max-width:960px;margin:0 auto;padding:80px 24px}
h1{font-size:56px;line-height:1.05;margin:0 0 12px;font-family:'Helvetica Neue',sans-serif;letter-spacing:-.02em}
.sub{color:#a7a9be;font-size:20px;margin-bottom:48px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{aspect-ratio:3/4;border-radius:14px;overflow:hidden;background:#232946}
.card img{width:100%;height:100%;object-fit:cover;display:block}
.tag{display:inline-block;background:#eebbc3;color:#232946;padding:6px 14px;border-radius:999px;font-family:sans-serif;font-size:13px;font-weight:700;margin-bottom:24px}</style></head>
<body><div class="wrap"><span class="tag">SS26 COLLECTION</span><h1>The Lookbook</h1>
<p class="sub">A fully hand-coded page — every pixel authored in HTML, sitting alongside the block-built pages.</p>
<div class="grid">
${['Coat', 'Knit', 'Denim', 'Boots', 'Bag', 'Scarf'].map((t) => `<div class="card"><img src="https://placehold.co/440x580?text=${t}" alt="${t}"/></div>`).join('')}
</div></div></body></html>`,
  };
  const blogDraft = blockPage({
    id: 'demo-blog', name: 'Journal (draft)', slug: 'journal', status: 'draft',
    blocks: [['content', { headings: ['Notes from the studio'], text: ['A work-in-progress page, left as a draft so you can show the draft vs published state.'] }]],
  });
  return [home, about, services, contact, custom, blogDraft];
}

async function seedAnalytics(orgId) {
  const paths = ['', 'about', 'services', 'contact', 'lookbook'];
  const rows = [];
  const today = new Date();
  for (let d = 29; d >= 0; d--) {
    const day = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    for (const path of paths) {
      // Home gets the most traffic; a gentle weekly wave + upward drift.
      const base = path === '' ? 60 : 18;
      const wave = Math.round(Math.sin(d / 3) * 6 + (29 - d) * 0.6);
      const views = Math.max(1, base + wave + Math.floor(Math.random() * 10));
      rows.push({ org_id: orgId, day, path, views });
    }
  }
  const { error } = await db().from('page_views').upsert(rows, { onConflict: 'org_id,day,path' });
  if (error) throw new Error(`[demoSeed/analytics] ${error.message}`);
}

async function seedForms(orgId) {
  const contacts = [
    { name: 'Jordan Reyes', email: 'jordan@brightfox.co', message: 'We need a new site before our Q3 launch — are you available?' },
    { name: 'Mei Chen', email: 'mei@paperlane.studio', message: 'Loved your work for Fernwood. Can we set up a call?' },
    { name: 'Tom Alvarez', email: 'tom@ridgeline.io', message: 'Ballpark for a 10-page marketing site + blog?' },
    { name: 'Sara Kaur', email: 'sara@northstar.org', message: 'Do you work with non-profits?' },
  ];
  for (const c of contacts) {
    await storage.forms.add(orgId, { id: rid('form'), formName: 'Contact Form', pagePath: 'contact', fields: c });
  }
  const emails = ['newsub1@example.com', 'newsub2@example.com', 'reader@example.com', 'fan@example.com', 'hello@studio.co'];
  for (const email of emails) {
    await storage.forms.add(orgId, { id: rid('form'), formName: 'Newsletter', pagePath: 'index', fields: { email } });
  }
}

async function seedMedia(orgId) {
  const assets = [
    { name: 'Hero background', label: 'Hero+BG', w: 1600, h: 900 },
    { name: 'Team photo', label: 'Team', w: 1200, h: 800 },
    { name: 'Product shot', label: 'Product', w: 1000, h: 1000 },
    { name: 'Studio', label: 'Studio', w: 1400, h: 933 },
  ];
  for (const a of assets) {
    await storage.media.add(orgId, {
      id: rid('media'), name: a.name, filename: `${a.label.toLowerCase()}.png`,
      mimeType: 'image/png', size: a.w * a.h, url: `https://placehold.co/${a.w}x${a.h}?text=${a.label}`,
      altText: a.name, description: '',
    }).catch(() => {}); // media.add signature is lenient; ignore if a field differs
  }
}

async function seedNewsletter(orgId, ownerEmail) {
  const starter = STARTER_TEMPLATES[0];
  await emailTemplates.save(orgId, { name: 'Studio Welcome', category: 'Lifecycle', document: starter.document, createdBy: ownerEmail });
  // A draft campaign ready to send, and a "sent" one with engagement so the
  // dashboard/stats have something to show.
  await emailCampaigns.save(orgId, { name: 'Spring newsletter', subject: 'New work + a spring offer', preheader: 'See what we shipped', document: starter.document, audience: { sources: ['newsletter'] }, status: 'draft', createdBy: ownerEmail });
  const sent = await emailCampaigns.save(orgId, { name: 'Launch announcement', subject: 'We redesigned everything', preheader: 'Take a look', document: starter.document, audience: { sources: ['newsletter'] }, status: 'sent', createdBy: ownerEmail });
  await emailCampaigns.setStatus(sent.id, 'sent', { sent_at: new Date().toISOString(), stats: { recipients: 420, delivered: 415, opens: 173, clicks: 41 } });
  // A few engagement events for the "sent" campaign.
  for (let i = 0; i < 8; i++) {
    const email = `reader${i}@example.com`;
    await emailCampaigns.recordEvent(orgId, { campaignId: sent.id, contactEmail: email, type: 'delivered' }).catch(() => {});
    if (i < 5) await emailCampaigns.recordEvent(orgId, { campaignId: sent.id, contactEmail: email, type: 'open' }).catch(() => {});
    if (i < 2) await emailCampaigns.recordEvent(orgId, { campaignId: sent.id, contactEmail: email, type: 'click', url: 'https://northwind.example/spring' }).catch(() => {});
  }
}

// Main entry. reset=true (default) wipes an existing demo org first so a
// re-run is clean; the FK cascades drop all its child rows.
export async function seedDemoWorkspace({ orgId = 'demo', orgName = 'Northwind & Co', ownerEmail, reset = true } = {}) {
  if (reset) await storage.orgs.remove(orgId).catch(() => {});

  const existing = await storage.orgs.get(orgId);
  if (!existing) {
    await storage.orgs.create({ id: orgId, name: orgName, plan: 'agency', featureFlags: {} });
  }

  // Owner membership so the operator can open the workspace.
  if (ownerEmail) await storage.orgMembers.add(orgId, ownerEmail, 'admin').catch(() => {});

  // Theme + site name.
  await storage.settings.replace(orgId, {
    siteName: orgName,
    theme: { primary: '#232946', secondary: '#eebbc3', bg: '#fffffe', text: '#232946', accent: '#eebbc3', link: '#232946', muted: '#6b7280', fontFamily: 'system', fontScale: 'comfortable' },
    timezone: 'America/New_York',
  });

  // Content.
  const pages = demoPages();
  await storage.pages.bulkReplace(orgId, pages);
  await storage.library.bulkReplace(orgId, [
    { id: 'demo-lib-cta', name: 'Booking CTA', html: renderBlock('cta', { headings: ['Ready to start?'], text: ['Book a free intro call.'], links: [{ href: '/contact', label: 'Book now' }] }) || '' },
  ]);
  await seedMedia(orgId);
  await seedForms(orgId);
  await seedAnalytics(orgId);
  await seedNewsletter(orgId, ownerEmail);

  // Deploy the current working copy so the public demo site is live, and turn
  // on the staging model + a couple of "coming soon" examples + social (sandbox).
  const [pgs, library, settings] = await Promise.all([storage.pages.list(orgId), storage.library.list(orgId), storage.settings.get(orgId)]);
  await deployments.deploy(orgId, { pages: pgs, library, settings, deployedBy: ownerEmail || 'demo-seed' });
  const featureFlags = {
    ...(await storage.orgs.get(orgId))?.feature_flags,
    staging_enabled: true, site_live: true, demo_mode: false,
    social: true, coming_soon: ['events', 'commerce'],
  };
  await storage.orgs.update(orgId, { featureFlags });

  return { orgId, pages: pages.length };
}
