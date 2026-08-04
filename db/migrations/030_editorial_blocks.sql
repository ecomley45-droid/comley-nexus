-- Editorial block set: numbered index, swatch cards, timeline, and a
-- multi-step lead form.
--
-- Added for the Ethan Scott Realty template but deliberately generic — an
-- eyebrow kicker, a numbered reference list, a swatch grid and a labelled
-- timeline are the shapes editorial layouts keep reaching for, and none of
-- them existed. The lead form is the one with real conversion value: asking
-- for an email first converts far worse than asking last, after someone has
-- already invested four taps, and the plain Contact Form block can't express
-- that.
--
-- Like every other catalog row, `html` is never stored — it's derived
-- client-side from default_fields, so a renderer change lands without a data
-- migration.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values
  (
    'numbered-index', null, 'numbered-index', 'Numbered Index', 'Content',
    'A numbered reference list — services, trades, chapters. Reads like an index rather than a bulleted list.',
    '{"eyebrow":"The list","headings":["What we cover"],"text":["A short line about what this list is and why it exists."],"items":[{"heading":"Plumbing"},{"heading":"HVAC"},{"heading":"Roofing"},{"heading":"Electrical"},{"heading":"Foundation"},{"heading":"Painting"}]}'::jsonb,
    40
  ),
  (
    'swatch-cards', null, 'swatch-cards', 'Swatch Cards', 'Content',
    'Three cards, each topped with a colour bar and a small numbered label. Good for features that are coming soon or grouped by theme.',
    '{"eyebrow":"Coming soon","headings":["Everything in one place."],"text":["What these cards are for."],"items":[{"heading":"Every document, filed","link":"Warranties","body":"Searchable instead of shoved in a drawer.","meta":"#4E6E62"},{"heading":"Room by room","link":"Paint colours","body":"The exact colour and finish in each room.","meta":"#C08A2E"},{"heading":"A calendar that nudges you","link":"Maintenance","body":"Seasonal reminders tuned to your area.","meta":"#12201F"}],"buttonLabel":"In development"}'::jsonb,
    41
  ),
  (
    'timeline', null, 'timeline', 'Timeline', 'Content',
    'A labelled timeline — a career, a process, a set of stages. The label column stays aligned however long the labels get.',
    '{"eyebrow":"How we got here","headings":["The short version."],"items":[{"meta":"THEN","body":"Where this started, and what it looked like."},{"meta":"NOW","body":"What it looks like today."},{"meta":"NEXT","body":"Where it goes from here."}]}'::jsonb,
    42
  ),
  (
    'lead-form', null, 'lead-form', 'Multi-step Lead Form', 'Conversion',
    'A short qualifying form that asks the easy questions first and contact details last, which converts far better than leading with an email box. Responses land in your Forms inbox.',
    '{"headings":["Tell me what you are looking for"],"items":[{"heading":"What brings you here?","link":"Pick one. You can change your mind later.","meta":"single","body":"Buying, Selling, Both at once, Just looking","image":"intent"},{"heading":"Which area?","link":"Choose as many as you like.","meta":"multi","body":"Downtown, Suburbs, Rural, Still deciding","image":"areas"},{"heading":"Budget and timing.","link":"Rough is fine.","meta":"single","body":"Under $300k, $300-500k, $500-750k, $750k+","image":"budget"}],"buttonLabel":"Where should I send them?","placeholder":"You will hear from a person, not a call centre.","consent":"Send me matching listings and market notes by email. I can unsubscribe any time."}'::jsonb,
    43
  )
on conflict (id) do nothing;
