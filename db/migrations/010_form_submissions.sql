-- Form submissions: the backend for the Contact Form and Newsletter
-- blocks, which until now were static previews that submitted nowhere.
-- Public pages POST to /api/public/forms (rate-limited + honeypot);
-- workspace users read them in the new Forms inbox page.
--
-- Safe to re-run: IF NOT EXISTS everywhere, updates are idempotent.

create table if not exists form_submissions (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  form_name text not null default 'Contact form',
  page_path text not null default '',
  fields jsonb not null default '{}',
  is_read boolean not null default false,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_form_submissions_org on form_submissions(org_id, submitted_at desc);

-- The Contact Form and Newsletter catalog descriptions said submissions
-- weren't wired up -- that's no longer true.
update nexus_block_catalog
   set description = 'A working contact form -- name, email, message. Submissions land in your Forms inbox and can notify you by email.'
 where id = 'contact-form';

update nexus_block_catalog
   set description = 'Email capture panel. Signups land in your Forms inbox and can notify you by email.'
 where id = 'newsletter';
