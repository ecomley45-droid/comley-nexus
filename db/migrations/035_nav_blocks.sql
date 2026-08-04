-- Five navigation bars, all of which take a logo.
--
-- The original `header` block is a site name and a row of links that never
-- collapses -- fine as a placeholder, wrong on a phone, and with nowhere to
-- put a logo. Nothing in the catalog did, which meant every site with a mark
-- was pasting an <img> into a Script block or going without.
--
-- All five share the same field set (logo, site name, links, optional call to
-- action) so switching between them is a change of arrangement, not a
-- re-entry of content. The logo falls back to the site name as a wordmark, so
-- a bar is never empty while someone is still deciding on artwork.
--
-- Every one of them collapses to a toggle below 900px, and every menu closes
-- on Escape and on a click outside: a menu you can only shut by finding the
-- same small button again is a trap on a phone.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values
  (
    'nav-logo', null, 'nav-logo', 'Nav — Logo + Links', 'Navigation',
    'Logo on the left, links on the right, optional button. The arrangement most of the web uses, and the one to reach for when nothing argues otherwise.',
    '{"headings":["Your name"],"images":[],"links":[{"href":"/","label":"Home"},{"href":"/about","label":"About"},{"href":"/contact","label":"Contact"}],"logoHeight":32,"ctaLabel":"Get in touch","ctaHref":"/contact","sticky":true}'::jsonb,
    2
  ),
  (
    'nav-center', null, 'nav-center', 'Nav — Centred Logo', 'Navigation',
    'Logo in the middle with the links split either side. Reads as considered rather than default, which is why editorial, fashion and property sites keep choosing it.',
    '{"headings":["Your name"],"images":[],"links":[{"href":"/","label":"Home"},{"href":"/homes","label":"Homes"},{"href":"/about","label":"About"},{"href":"/contact","label":"Contact"}],"logoHeight":36,"sticky":true}'::jsonb,
    3
  ),
  (
    'nav-utility', null, 'nav-utility', 'Nav — Utility Bar', 'Navigation',
    'A thin strip above the main bar for a phone number, licence line or hours — the details that matter to the people who call but would clutter the navigation.',
    '{"headings":["Your name"],"images":[],"text":["Serving the Upstate since 2009"],"items":[{"heading":"(864) 380-9582","link":"tel:8643809582"},{"heading":"Email","link":"mailto:hello@example.com"}],"links":[{"href":"/","label":"Home"},{"href":"/about","label":"About"},{"href":"/contact","label":"Contact"}],"logoHeight":34,"ctaLabel":"Book a call","ctaHref":"/contact","sticky":true}'::jsonb,
    4
  ),
  (
    'nav-overlay', null, 'nav-overlay', 'Nav — Transparent Over Hero', 'Navigation',
    'Sits transparent over a full-bleed hero and turns solid once you scroll past it. Add a second, light logo and it swaps automatically.',
    '{"headings":["Your name"],"images":[],"links":[{"href":"/","label":"Home"},{"href":"/work","label":"Work"},{"href":"/contact","label":"Contact"}],"logoHeight":32,"ctaLabel":"Get started","ctaHref":"/contact","solidAfter":80}'::jsonb,
    5
  ),
  (
    'nav-drawer', null, 'nav-drawer', 'Nav — Menu Drawer', 'Navigation',
    'Just a logo and a menu button, at every width; the links open in a full-screen sheet. For sites with few pages and a lot of photography that shouldn''t compete with a link row.',
    '{"headings":["Your name"],"images":[],"links":[{"href":"/","label":"Home"},{"href":"/work","label":"Work"},{"href":"/studio","label":"Studio"},{"href":"/contact","label":"Contact"}],"logoHeight":32,"ctaLabel":"Enquire","ctaHref":"/contact","sticky":true}'::jsonb,
    6
  )
on conflict (id) do nothing;
