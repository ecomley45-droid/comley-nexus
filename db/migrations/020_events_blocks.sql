-- Events, sliders, and marquees for "Add Block +". An easy, no-code way to
-- drop in a business's events (agenda list + month calendar), plus a flyer
-- slider and CSS-animated logo / testimonial marquees. All theme-aware; html
-- is derived client-side from default_fields.
--
-- Events model is intentionally block-level (author events right in the page)
-- rather than a separate database subsystem -- the calendar reads each item's
-- meta as a YYYY-MM-DD date; the events list uses meta as a free-text date/
-- time chip.
--
-- Safe to re-run: ON CONFLICT DO NOTHING.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('events-list', null, 'events-list', 'Events List', 'Interactive', 'A clean agenda of upcoming events with a date chip, title, details, and a link. Drop in your business''s events right here.', '{"headings":["Upcoming events"],"text":["What is happening at our place."],"items":[{"meta":"Fri, Aug 15","heading":"Live music: The Copper Trio","body":"Doors 7pm · Main room · Free entry","link":"#"},{"meta":"Sat, Aug 23","heading":"Weekend market","body":"9am–2pm · Front patio","link":"#"},{"meta":"Thu, Sep 4","heading":"Wine tasting night","body":"6:30pm · Reservations required","link":"#"}]}'::jsonb, 55),
  ('calendar', null, 'calendar', 'Calendar', 'Interactive', 'A month calendar that highlights the days your events fall on. Set the month, then add events with a YYYY-MM-DD date.', '{"headings":["This month"],"month":"2026-08","items":[{"meta":"2026-08-15","heading":"Live music"},{"meta":"2026-08-23","heading":"Weekend market"},{"meta":"2026-08-29","heading":"Trivia night"}]}'::jsonb, 56),
  ('flyer-slider', null, 'flyer-slider', 'Flyer Slider', 'Media', 'A swipeable slider of event flyers or posters (scroll-snap, no code). Captions come from each image''s alt text.', '{"headings":["What is on"],"images":[{"src":"https://placehold.co/600x800?text=Flyer+1","alt":"Summer Fest — Aug 15"},{"src":"https://placehold.co/600x800?text=Flyer+2","alt":"Market Day — Aug 23"},{"src":"https://placehold.co/600x800?text=Flyer+3","alt":"Trivia Night — Aug 29"}]}'::jsonb, 57),
  ('logo-marquee', null, 'logo-marquee', 'Logo Marquee', 'Social Proof', 'An auto-scrolling strip of partner or sponsor logos (CSS animation, no code).', '{"headings":["As seen in"],"images":[{"src":"https://placehold.co/140x40?text=Logo","alt":"Logo"},{"src":"https://placehold.co/140x40?text=Logo","alt":"Logo"},{"src":"https://placehold.co/140x40?text=Logo","alt":"Logo"},{"src":"https://placehold.co/140x40?text=Logo","alt":"Logo"},{"src":"https://placehold.co/140x40?text=Logo","alt":"Logo"}]}'::jsonb, 58),
  ('testimonial-marquee', null, 'testimonial-marquee', 'Scrolling Testimonials', 'Social Proof', 'Review cards that scroll continuously and pause on hover (CSS animation, no code).', '{"headings":["What people say"],"items":[{"heading":"Jamie R.","meta":"Regular","body":"Best spot in the neighborhood, hands down.","image":"https://placehold.co/80x80?text=JR"},{"heading":"Priya S.","meta":"First visit","body":"Warm, easy, and the event nights are so much fun.","image":"https://placehold.co/80x80?text=PS"},{"heading":"Marcus L.","meta":"Local","body":"I bring everyone here. It never misses.","image":"https://placehold.co/80x80?text=ML"}]}'::jsonb, 59)
on conflict (id) do nothing;
