-- Editable block catalog for "Add Block +" (see src/cms/lib/blocks/).
-- Replaces the static src/cms/lib/blocks/catalog.js file with a real table
-- so Super Admin can edit the platform-wide catalog, and client workspaces
-- can add their own private blocks alongside it.
--
-- org_id = null -> platform-wide, Super-Admin-editable only.
-- org_id = <id> -> belongs to that workspace, editable by that workspace's
--   own editors/admins (requireRole('editor')), never visible to others.
--
-- Deletes are soft (is_active) -- hiding an entry from the picker never
-- needs to reason about pages that already used it, since inserting a
-- block from the catalog copies `fields`/`html` into the page's own
-- content at that moment (see buildSectionFromCatalog() client-side);
-- there is no live reference back to this table afterward.
--
-- Safe to re-run: table creation uses IF NOT EXISTS, seed uses
-- ON CONFLICT DO NOTHING.

create table if not exists nexus_block_catalog (
  id text primary key,
  org_id text references orgs(id) on delete cascade,
  block_type text not null,
  name text not null,
  category text not null,
  description text not null default '',
  default_fields jsonb not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nexus_block_catalog_org on nexus_block_catalog(org_id);
create index if not exists idx_nexus_block_catalog_active on nexus_block_catalog(is_active);

-- Seed: the 25 entries previously hardcoded in catalog.js, generated
-- programmatically from that file so nothing drifts on migration.
insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('header', null, 'header', 'Header', 'Structure', 'Logo/site name on the left, nav links on the right.', '{"headings":["Your Brand"],"text":[],"images":[],"links":[{"href":"/","label":"Home"},{"href":"/about","label":"About"},{"href":"/contact","label":"Contact"}]}'::jsonb, 0),
  ('navigation', null, 'navigation', 'Navigation', 'Structure', 'A standalone horizontal link bar, without the logo/header chrome.', '{"headings":[],"text":[],"images":[],"links":[{"href":"/","label":"Home"},{"href":"/products","label":"Products"},{"href":"/pricing","label":"Pricing"}]}'::jsonb, 1),
  ('footer', null, 'footer', 'Footer', 'Structure', 'Copyright line plus a row of links.', '{"headings":[],"text":["© 2026 Your Company. All rights reserved."],"images":[],"links":[{"href":"/privacy","label":"Privacy"},{"href":"/terms","label":"Terms"}]}'::jsonb, 2),
  ('breadcrumb', null, 'breadcrumb', 'Breadcrumb', 'Structure', 'A manually-entered "you are here" trail. Not linked to real page hierarchy yet -- edit the links to match this page’s location.', '{"links":[{"href":"/","label":"Home"},{"href":"#","label":"Category"},{"href":"#","label":"Current page"}]}'::jsonb, 3),
  ('hero', null, 'hero', 'Hero', 'Content', 'Big headline, supporting line, one call-to-action button.', '{"headings":["A bold headline that grabs attention"],"text":["Supporting copy that explains the value in one or two sentences."],"images":[],"links":[{"href":"#","label":"Get started"}]}'::jsonb, 4),
  ('banner', null, 'banner', 'Banner', 'Content', 'A shorter hero with a background image, for announcements.', '{"headings":["Announcing something new"],"text":["A short supporting line goes here."],"images":[{"src":"https://placehold.co/1200x400?text=Banner%20image","alt":"Banner image"}],"links":[{"href":"#","label":"Learn more"}]}'::jsonb, 5),
  ('rich-text', null, 'content', 'Rich Text', 'Content', 'Freeform heading + paragraphs for anything that doesn’t need a template.', '{"headings":["A rich text section"],"text":["Write anything here — announcements, longer-form copy, or supporting detail for the page."],"images":[],"links":[]}'::jsonb, 6),
  ('feature-grid', null, 'card-grid', 'Feature Grid', 'Content', 'A row of title + description cards, for listing product features.', '{"headings":["Everything you need"],"text":[],"images":[],"links":[],"items":[{"heading":"Fast","body":"Ships in minutes, not weeks."},{"heading":"Secure","body":"Sanitized by default, no exceptions."},{"heading":"Flexible","body":"Structured fields or raw HTML — your choice."}]}'::jsonb, 7),
  ('stats', null, 'stats', 'Stats / Counters', 'Content', 'A row of big numbers with labels underneath.', '{"headings":["By the numbers"],"items":[{"heading":"10k+","body":"Active users"},{"heading":"99.9%","body":"Uptime"},{"heading":"24/7","body":"Support"}]}'::jsonb, 8),
  ('logo-cloud', null, 'logo-cloud', 'Logo Cloud', 'Content', '"Trusted by" row of partner/customer logos.', '{"headings":["Trusted by teams at"],"images":[{"src":"https://placehold.co/120x40?text=Logo","alt":"Logo"},{"src":"https://placehold.co/120x40?text=Logo","alt":"Logo"},{"src":"https://placehold.co/120x40?text=Logo","alt":"Logo"},{"src":"https://placehold.co/120x40?text=Logo","alt":"Logo"}]}'::jsonb, 9),
  ('testimonials', null, 'testimonials', 'Testimonials', 'Social Proof', 'Quote cards with author name, role, and photo.', '{"headings":["What people are saying"],"items":[{"heading":"Jane Doe","meta":"CEO, Acme Inc.","body":"\"This product changed how our team works.\"","image":"https://placehold.co/80x80?text=JD"},{"heading":"Sam Lee","meta":"Head of Marketing, Northwind","body":"\"Setup took minutes, not weeks.\"","image":"https://placehold.co/80x80?text=SL"}]}'::jsonb, 10),
  ('team', null, 'team', 'Team Members', 'Social Proof', 'Photo, name, and role cards for an About/Team page.', '{"headings":["Meet the team"],"items":[{"heading":"Alex Rivera","meta":"Founder","body":"Building the product day to day.","image":"https://placehold.co/200x200?text=Photo"},{"heading":"Priya Shah","meta":"Design","body":"Making everything look this good.","image":"https://placehold.co/200x200?text=Photo"}]}'::jsonb, 11),
  ('cta', null, 'cta', 'CTA Banner', 'Conversion', 'A focused call-to-action panel with one or two buttons.', '{"headings":["Ready when you are."],"text":["Get started in minutes."],"links":[{"href":"#","label":"Get started"}]}'::jsonb, 12),
  ('pricing-table', null, 'pricing-table', 'Pricing Table', 'Conversion', 'Side-by-side plans with price, feature list, and a CTA each.', '{"headings":["Simple pricing"],"plans":[{"name":"Starter","price":"$49","period":"/mo","features":["1 workspace","Custom domain"],"ctaLabel":"Get started","ctaHref":"#","highlighted":false},{"name":"Pro","price":"$129","period":"/mo","features":["Everything in Starter","Unlimited pages"],"ctaLabel":"Get started","ctaHref":"#","highlighted":true}]}'::jsonb, 13),
  ('newsletter', null, 'newsletter', 'Newsletter Signup', 'Conversion', 'Email capture panel. Static preview -- wire the button to a real subscribe endpoint before publishing.', '{"headings":["Stay in the loop"],"text":["Get product updates in your inbox."],"buttonLabel":"Subscribe"}'::jsonb, 14),
  ('contact-form', null, 'form', 'Contact Form', 'Conversion', 'A form placeholder. Static preview -- form markup isn’t generated yet, rebuild the fields you need in the block editor.', '{"headings":["Get in touch"],"text":["Fill this out and we’ll get back to you."]}'::jsonb, 15),
  ('image', null, 'image', 'Image', 'Media', 'A single centered image.', '{"images":[{"src":"https://placehold.co/900x500?text=Image","alt":"Image"}]}'::jsonb, 16),
  ('gallery', null, 'gallery', 'Image Gallery', 'Media', 'A responsive grid of images.', '{"headings":["Gallery"],"images":[{"src":"https://placehold.co/400x300?text=Photo%201","alt":"Photo 1"},{"src":"https://placehold.co/400x300?text=Photo%202","alt":"Photo 2"},{"src":"https://placehold.co/400x300?text=Photo%203","alt":"Photo 3"}]}'::jsonb, 17),
  ('video', null, 'video', 'Video Embed', 'Media', 'An embedded YouTube or Vimeo video. Paste a normal watch/share URL -- it’s converted to an embed URL automatically.', '{"headings":["Watch the demo"],"text":[],"videoUrl":""}'::jsonb, 18),
  ('faq', null, 'faq', 'FAQ Accordion', 'Interactive', 'Click-to-expand question/answer pairs (no JavaScript, native disclosure widget).', '{"headings":["Frequently asked questions"],"items":[{"heading":"What is this?","body":"A short, clear answer goes here."},{"heading":"How do I get started?","body":"Another clear, short answer."}]}'::jsonb, 19),
  ('tabs', null, 'tabs', 'Tabs', 'Interactive', 'Labeled content sections shown stacked. Not click-to-switch yet -- that needs a bigger sanitizer change (input/label tags) than this block warrants today.', '{"headings":["Learn more"],"items":[{"heading":"Overview","body":"Overview content goes here."},{"heading":"Details","body":"Details content goes here."}]}'::jsonb, 20),
  ('countdown', null, 'countdown', 'Countdown', 'Interactive', 'A styled deadline display. Not a live-ticking countdown yet -- that needs inline <script>, which isn’t allowed in page content today.', '{"headings":["Offer ends soon"],"text":["Don’t miss out."],"targetDate":"2026-08-04T06:28:40.519Z"}'::jsonb, 21),
  ('social-links', null, 'social-links', 'Social Links', 'Interactive', 'A row of pill-style links to your social profiles.', '{"links":[{"href":"https://twitter.com","label":"Twitter"},{"href":"https://instagram.com","label":"Instagram"},{"href":"https://linkedin.com","label":"LinkedIn"}]}'::jsonb, 22),
  ('card-grid', null, 'card-grid', 'Card Grid', 'Interactive', 'A grid of image + title + description cards, for products, articles, or links.', '{"headings":["Explore"],"items":[{"heading":"Card one","body":"Description of the first item.","image":"https://placehold.co/400x240?text=Image","link":"#"},{"heading":"Card two","body":"Description of the second item.","image":"https://placehold.co/400x240?text=Image","link":"#"},{"heading":"Card three","body":"Description of the third item.","image":"https://placehold.co/400x240?text=Image","link":"#"}]}'::jsonb, 23),
  ('list', null, 'list', 'List', 'Interactive', 'A vertical list of title + description rows.', '{"headings":["A list of things"],"items":[{"heading":"Item one","body":"Description of the first item."},{"heading":"Item two","body":"Description of the second item."}]}'::jsonb, 24)
on conflict (id) do nothing;
