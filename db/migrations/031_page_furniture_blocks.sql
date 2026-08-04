-- Page furniture: a full-viewport video hero, a mobile sticky CTA bar, and a
-- reading-progress line.
--
-- These are the pieces a designed landing page has that the block set had no
-- way to express. video-bg was the closest thing to a hero and it's a 460px
-- centred band with hardcoded white text — fine as a mid-page interruption,
-- wrong as the first thing anyone sees.
--
-- All three degrade rather than break: the hero falls back to an animated
-- gradient when there's no video and no poster, the sticky bar disappears
-- above 1040px where a permanent bar is just lost space, and the progress
-- line is aria-hidden because it carries no information a screen reader
-- needs.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values
  (
    'hero-video', null, 'hero-video', 'Video Hero', 'Media',
    'A full-screen hero with a looping background video. Falls back to an animated gradient until you add one, and skips the video entirely on metered connections.',
    '{"eyebrow":"Your location or tagline","headings":["A headline worth the whole screen."],"text":["One or two lines that say what you do and who for."],"links":[{"href":"/start","label":"Get started"},{"href":"tel:","label":"Call or text"}],"buttonLabel":"Scroll to see more","images":[],"videoUrl":""}'::jsonb,
    44
  ),
  (
    'sticky-cta', null, 'sticky-cta', 'Sticky CTA Bar', 'Conversion',
    'A call to action pinned to the bottom of the screen on phones, where your main button is otherwise a scroll away. Hidden on desktop, and retracts while the section it points at is on screen.',
    '{"links":[{"href":"/start","label":"Get started"},{"href":"tel:","label":"Call"}],"buttonLabel":""}'::jsonb,
    45
  ),
  (
    'scroll-progress', null, 'scroll-progress', 'Reading Progress', 'Interactive',
    'A hairline bar across the top of the window showing how far down the page someone is. Ambient only — it adds nothing to the accessibility tree.',
    '{"limit":2}'::jsonb,
    46
  )
on conflict (id) do nothing;
