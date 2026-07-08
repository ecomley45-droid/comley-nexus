-- Parallax + video blocks for "Add Block +".
--   parallax    : CSS-only fixed-background section (no JS). Two starter
--                 variations (banner + stats).
--   video-bg    : full-bleed background <video> hero (needs an .mp4 URL; the
--                 published-page CSP media-src now allows https/self video).
--   video-split : YouTube/Vimeo embed beside copy (CSP frame-src already
--                 allows those hosts).
-- html is derived client-side from default_fields via the renderers.
--
-- Safe to re-run: ON CONFLICT DO NOTHING.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('parallax', null, 'parallax', 'Parallax Banner', 'Media', 'A fixed background image that stays put as the page scrolls, with a heading, text, and CTA on top. No code, no JavaScript.', '{"headings":["Built for the moments that move you"],"text":["A short, evocative line that sits over a full-bleed background image."],"links":[{"href":"#","label":"Explore"}],"images":[{"src":"https://placehold.co/1600x900?text=Parallax","alt":"Background"}]}'::jsonb, 51),
  ('parallax-stats', null, 'parallax', 'Parallax Stats', 'Media', 'A parallax background with a row of big stats on top.', '{"headings":["Trusted at scale"],"images":[{"src":"https://placehold.co/1600x900?text=Background","alt":"Background"}],"items":[{"heading":"120k+","body":"Customers"},{"heading":"4.9/5","body":"Rating"},{"heading":"15 yrs","body":"In business"}]}'::jsonb, 52),
  ('video-bg', null, 'video-bg', 'Background Video', 'Media', 'A full-bleed autoplaying, muted, looping background video with overlay text. Paste an .mp4 URL and set a poster image.', '{"headings":["See it in motion"],"text":["Add an .mp4 video URL and a poster image to bring this hero to life."],"links":[{"href":"#","label":"Get started"}],"images":[{"src":"https://placehold.co/1600x900?text=Poster","alt":"Poster"}],"videoUrl":""}'::jsonb, 53),
  ('video-split', null, 'video-split', 'Video + Text', 'Media', 'A YouTube or Vimeo video beside a heading, copy, and a link.', '{"headings":["Watch how it works"],"text":["A short walkthrough beats a wall of text. Drop in a YouTube or Vimeo link."],"links":[{"href":"#","label":"Learn more"}],"videoUrl":""}'::jsonb, 54)
on conflict (id) do nothing;
