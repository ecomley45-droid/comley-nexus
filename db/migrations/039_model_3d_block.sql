-- The 3D Model block.
--
-- Renders a .glb through a sandboxed same-origin iframe (see lib/modelFrame.js
-- for why it can't run on the page directly under the strict CSP). Like every
-- catalog row, `html` is never stored -- it's derived from these fields.
--
-- interact defaults on: a static 3D model is just a worse photo, so the reason
-- to use this block at all is that visitors can turn it. AR defaults off
-- because it needs a model built for real-world scale to be worth showing.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values (
  'model-3d', null, 'model-3d', '3D Model', 'Media',
  'An interactive 3D model a visitor can spin and zoom, with optional "view it in your space" AR on phones. Upload a .glb file — phone-scanning apps like Polycam export them.',
  '{"headings":["See it in 3D"],"modelUrl":"","poster":"","alt":"","rotate":true,"interact":true,"ar":false,"iosUrl":"","bg":"transparent","bgColor":"","height":480,"caption":"Drag to rotate"}'::jsonb,
  19
)
on conflict (id) do nothing;
