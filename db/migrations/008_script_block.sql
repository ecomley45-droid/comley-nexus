-- Seeds the "Script" block into the platform-wide catalog (see
-- 006_block_catalog.sql for the table itself). Unlike every other block,
-- this one renders arbitrary inline JavaScript on the published page --
-- see lib/sanitize.js's 'script'/'noscript' CONTENT_CONFIG entry and the
-- admin-only save gate in server.js/lib/nexusRoutes.js for the
-- compensating controls that come with it.
--
-- Safe to re-run: insert uses ON CONFLICT DO NOTHING.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('script', null, 'script', 'Script', 'Advanced', 'Runs raw, unsandboxed JavaScript on the published page. No visual output. Saving a page with this block requires workspace admin, not just editor.', '{"code":""}'::jsonb, 25)
on conflict (id) do nothing;

-- The Countdown and Tabs blocks' descriptions (006) said live-updating
-- behavior wasn't possible because inline <script> wasn't allowed yet --
-- that's no longer true now that the Script block exists, so refresh the
-- wording rather than leave a stale claim in the catalog.
update nexus_block_catalog
   set description = 'A styled deadline display. Not a live-ticking countdown on its own -- pair it with a Script block for live JS updates.'
 where id = 'countdown';

update nexus_block_catalog
   set description = 'Labeled content sections shown stacked. Not click-to-switch on its own -- pair it with a Script block for interactive tab switching.'
 where id = 'tabs';
