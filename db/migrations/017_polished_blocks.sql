-- Seeds the "polished" general block set (px-* renderers in
-- blockRenderers.js) into the platform block catalog so they appear in
-- "Add Block +". These are richer, theme-aware layouts (split hero, image +
-- text, feature tiles, how-it-works steps, price/menu list, stat band, pull
-- quote, CTA band) inspired by the imported site templates. Like every other
-- catalog row, `html` is derived client-side from default_fields via the
-- renderer, so nothing here stores markup.
--
-- Safe to re-run: ON CONFLICT DO NOTHING.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('hero-split', null, 'hero-split', 'Split Hero', 'Content', 'Headline + copy + dual CTA on the left, image on the right.', '{"headings":["Design that moves you forward"],"text":["A short, punchy value proposition in a line or two that sets the tone for the page."],"links":[{"href":"#","label":"Get started"},{"href":"#","label":"Learn more"}],"images":[{"src":"https://placehold.co/800x600?text=Hero","alt":"Hero image"}]}'::jsonb, 25),
  ('split-content', null, 'split-content', 'Image + Text', 'Content', 'An image beside a heading, paragraphs, and a link. Great for alternating story sections.', '{"headings":["Built around what matters"],"text":["Explain a feature or tell part of your story in a paragraph or two, paired with a supporting image."],"images":[{"src":"https://placehold.co/720x580?text=Image","alt":"Section image"}],"links":[{"href":"#","label":"Read more"}]}'::jsonb, 26),
  ('feature-icons', null, 'feature-icons', 'Feature Tiles', 'Content', 'A grid of feature cards, each with a gradient icon tile, title, and description.', '{"headings":["Everything you need"],"text":["A short line introducing the highlights below."],"items":[{"heading":"Fast","body":"Loads in a blink and stays smooth."},{"heading":"Secure","body":"Sanitized by default, no surprises."},{"heading":"Flexible","body":"Adapts to your brand and content."}]}'::jsonb, 27),
  ('steps', null, 'steps', 'How It Works', 'Content', 'Numbered steps that walk visitors through a process.', '{"headings":["How it works"],"items":[{"heading":"Tell us what you need","body":"Share a few details to get started."},{"heading":"We build it","body":"Your site comes together fast."},{"heading":"Go live","body":"Publish with a single click."}]}'::jsonb, 28),
  ('price-list', null, 'price-list', 'Price / Menu List', 'Conversion', 'Name + price rows with optional descriptions. Perfect for menus, services, or rate cards.', '{"headings":["Menu"],"text":["Freshly made, every day."],"items":[{"heading":"Signature massage","meta":"$120","body":"60 minutes of full-body calm."},{"heading":"Deep tissue","meta":"$140","body":"Targeted pressure for tension relief."},{"heading":"Hot stone","meta":"$150","body":"Warm stones melt away the stress."}]}'::jsonb, 29),
  ('cta-band', null, 'cta-band', 'CTA Band', 'Conversion', 'A full-width gradient call-to-action panel with a button.', '{"headings":["Ready when you are"],"text":["Get started in minutes — no credit card required."],"links":[{"href":"#","label":"Get started"}]}'::jsonb, 30),
  ('stat-band', null, 'stat-band', 'Stat Band', 'Social Proof', 'A row of big gradient numbers with labels on a soft banner.', '{"headings":[],"items":[{"heading":"120+","body":"Projects shipped"},{"heading":"9 yrs","body":"In business"},{"heading":"96%","body":"Clients who return"}]}'::jsonb, 31),
  ('quote', null, 'quote', 'Pull Quote', 'Social Proof', 'A large centered testimonial quote with an author.', '{"text":["They treated our launch like it was their own — the best experience we have had."],"items":[{"heading":"Dana Whitfield","meta":"Founder, Fieldnote","image":"https://placehold.co/96x96?text=DW"}]}'::jsonb, 32)
on conflict (id) do nothing;
