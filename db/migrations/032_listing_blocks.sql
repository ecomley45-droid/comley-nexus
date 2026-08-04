-- Property listings: five blocks on top of the existing collections tables.
--
-- No new tables on purpose. A listing differs from a case study by its
-- fields, not by how it is stored, and collections (029) already solved
-- drafts, slugs, org scoping, the media library and per-entry detail pages.
-- A parallel `listings` table would mean solving all of that a second time
-- and keeping the two in step forever.
--
-- What listings needed that collections lacked was a multi-value field type,
-- so `tags` joins the closed set in src/shared/collectionFields.js. That is
-- what makes "narrow to homes with a pool AND a garage" expressible at all.
--
-- The blocks split by what they are bound to:
--
--   listing-cards / listing-search   bound to a whole collection, hydrated
--                                    server-side from its published entries
--   listing-hero / -facts / -features  render the single entry a collection
--                                    detail page is being rendered for
--
-- listing-search filters entirely client-side over markup that already holds
-- every listing. That keeps results in the HTML for crawlers and for anyone
-- with JS off, costs no round-trip per keystroke, and stays inside the strict
-- CSP -- which allows hash-pinned inline script but no external JS, so a CDN
-- map library was never an option. The map is therefore drawn from
-- OpenStreetMap raster tiles as plain <img> elements, which `img-src https:`
-- already permits. Attribution renders in the corner, as ODbL requires.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values
  (
    'listing-search', null, 'listing-search', 'Listing Search', 'Listings',
    'A searchable, filterable grid of property listings with a map. Filters build themselves from what your listings actually contain, so you never see a "Pool" checkbox that matches nothing.',
    '{"placeholder":"Search by address, city, or MLS #","showMap":true,"emptyText":"No listings match those filters yet.","listings":[],"facets":{}}'::jsonb,
    50
  ),
  (
    'listing-cards', null, 'listing-cards', 'Listing Cards', 'Listings',
    'A grid of property listings — price, address, beds, baths, square footage and a status badge. Point it at a listings collection and it stays in sync.',
    '{"headings":["Featured homes"],"text":["A few of the places I have on the market right now."],"limit":6,"tagLimit":3,"emptyText":"No listings yet.","listings":[]}'::jsonb,
    51
  ),
  (
    'listing-hero', null, 'listing-hero', 'Listing Hero', 'Listings',
    'The top of a single property page: photo grid, price, address and the key numbers. For use on a listings detail page.',
    '{"listing":{}}'::jsonb,
    52
  ),
  (
    'listing-facts', null, 'listing-facts', 'Listing Details', 'Listings',
    'The description and property-details table for a single listing — type, lot size, year built, HOA, MLS number. For use on a listings detail page.',
    '{"headings":["Property details"],"listing":{}}'::jsonb,
    53
  ),
  (
    'listing-features', null, 'listing-features', 'Listing Features', 'Listings',
    'A single listing''s amenities, grouped the same way the search filters group them. Renders nothing when a listing has no features tagged.',
    '{"headings":["Features"],"listing":{}}'::jsonb,
    54
  )
on conflict (id) do nothing;
