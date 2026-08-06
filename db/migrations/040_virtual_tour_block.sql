-- The Virtual Tour block.
--
-- Embeds a hosted 3D/360 tour (Matterport and other real-estate tour hosts)
-- by iframing the provider's own player -- the same approach the Video Embed
-- block uses for YouTube. The allowed hosts live in src/shared/tourProviders.js,
-- which also builds the CSP frame-src fragment, so the page policy and the
-- renderer's validation can't drift. Like every catalog row, `html` is derived
-- from these fields, never stored.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values (
  'virtual-tour', null, 'virtual-tour', 'Virtual Tour', 'Media',
  'Embed a walkable 3D or 360° tour from Matterport, Kuula, CloudPano, Momento360, iGuide or Panoee. Paste the share link or the embed code — no coding.',
  '{"headings":["Take the tour"],"text":[],"tourUrl":"","height":520,"caption":"Drag to look around"}'::jsonb,
  20
)
on conflict (id) do nothing;
