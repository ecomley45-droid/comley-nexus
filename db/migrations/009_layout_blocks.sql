-- Seeds the 5 "Layout" block catalog entries (see 006_block_catalog.sql
-- for the table itself). All 5 share block_type 'layout' -- the same
-- renderer (renderLayout in blockRenderers.js) driven by a different fixed
-- `default_fields.template` key, which sets the column count/widths and
-- can't be changed after insertion (see src/cms/lib/pasteIn/blockRenderers.js's
-- LAYOUT_TEMPLATES for the definitions this must stay in sync with).
--
-- Each column starts empty ({"sections":[]}) -- content is added afterward
-- via the "Add block" picker inside each column in the page editor.
--
-- Safe to re-run: insert uses ON CONFLICT DO NOTHING.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('layout-two-column', null, 'layout', 'Two-column', 'Layout', 'Two equal-width columns with normal spacing between them. Add any block into either column.', '{"template":"two-column","columns":[{"id":"col-0","sections":[]},{"id":"col-1","sections":[]}]}'::jsonb, 30),
  ('layout-split-screen', null, 'layout', 'Split Screen', 'Layout', 'Two equal-width columns with no gap, edge to edge -- good for a full-bleed image next to text.', '{"template":"split-screen","columns":[{"id":"col-0","sections":[]},{"id":"col-1","sections":[]}]}'::jsonb, 31),
  ('layout-asymmetrical', null, 'layout', 'Asymmetrical', 'Layout', 'A narrow column next to a wider one (1:2 ratio) -- good for a sidebar next to main content.', '{"template":"asymmetrical","columns":[{"id":"col-0","sections":[]},{"id":"col-1","sections":[]}]}'::jsonb, 32),
  ('layout-grid', null, 'layout', 'Card/Block Grid', 'Layout', 'Three equal-width columns -- good for a row of cards or short blocks side by side.', '{"template":"grid","columns":[{"id":"col-0","sections":[]},{"id":"col-1","sections":[]},{"id":"col-2","sections":[]}]}'::jsonb, 33),
  ('layout-featured', null, 'layout', 'Featured', 'Layout', 'A large column next to a narrower one (2:1 ratio) -- good for a featured image or video with supporting content alongside.', '{"template":"featured","columns":[{"id":"col-0","sections":[]},{"id":"col-1","sections":[]}]}'::jsonb, 34)
on conflict (id) do nothing;
