-- The rest of a property detail page: an estimated payment, price history,
-- and nearby schools.
--
-- All three read the listing the page is being rendered for, so they are
-- entry blocks like listing-hero -- authored once on the detail template and
-- correct for every property.
--
-- Price history and schools come from two new fields on the listings preset,
-- stored as pipe-delimited lines ("2026-06-02 | Listed | 385000"). That is a
-- deliberate choice over nested jsonb: both lists are small, ordered, edited
-- as a block, and paste straight out of a spreadsheet. A repeating-group
-- editor for two fields nobody fills in more than five times would be more
-- machinery than the problem needs.
--
-- The calculator computes in the browser and posts nowhere. It collects no
-- financial details, so there is nothing to store, secure or consent to --
-- and it is labelled an estimate, because quoting a precise figure for
-- someone else's mortgage without knowing their credit, insurer or escrow
-- terms would be stating something we cannot know.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values
  (
    'mortgage-calculator', null, 'mortgage-calculator', 'Payment Calculator', 'Listings',
    'An estimated monthly payment a visitor can adjust — down payment, rate, term, taxes, insurance and HOA, with a breakdown ring. On a listing page it prefills from that home''s price. Nothing is sent anywhere.',
    '{"headings":["Estimated monthly payment"],"text":["An estimate only — your real payment depends on your rate, credit, insurer and escrow. Nothing here is sent anywhere."],"defaultPrice":350000,"downPercent":20,"ratePercent":6.5,"termYears":30,"listing":{}}'::jsonb,
    55
  ),
  (
    'price-history', null, 'price-history', 'Price History', 'Listings',
    'What a property''s price has done since it was listed. Fills from the listing''s own history; renders nothing when there isn''t one.',
    '{"headings":["Price history"],"listing":{}}'::jsonb,
    56
  ),
  (
    'nearby-schools', null, 'nearby-schools', 'Nearby Schools', 'Listings',
    'Schools near a property, with rating, distance and grade range. Fills from the listing; renders nothing when none are entered.',
    '{"headings":["Nearby schools"],"text":["A starting point only — confirm current attendance zones with the district before you rely on them."],"listing":{}}'::jsonb,
    57
  )
on conflict (id) do nothing;
