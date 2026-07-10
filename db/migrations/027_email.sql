-- Email builder: a Sailthru-style, block-based email template editor whose
-- documents compile to Outlook-safe HTML via MJML (see lib/email/render.js),
-- plus campaigns that send to the workspace's existing audience (newsletter
-- signups + commerce customers) and per-recipient engagement events.
--
-- A "document" is the editable block tree (rows -> columns -> blocks); it's
-- stored as jsonb and compiled to HTML on preview and at send time, so a
-- renderer improvement reflects everywhere with no data migration -- same
-- principle as the page block catalog.
--
-- Safe to re-run: IF NOT EXISTS everywhere; seed uses ON CONFLICT DO NOTHING.

-- Reusable designs. org_id = null -> platform-wide starter gallery
-- (Super-Admin-editable, shown to every workspace). org_id = <id> -> a
-- workspace's own saved template.
create table if not exists email_templates (
  id          text primary key,
  org_id      text references orgs(id) on delete cascade,
  name        text not null,
  category    text not null default 'General',
  document    jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_email_templates_org on email_templates(org_id);

-- A campaign is one send. It snapshots its own document (so editing a
-- template later never rewrites history), targets an audience spec, and
-- tracks aggregate stats. audience is a JSON filter like
-- {"sources":["newsletter","customers"]} resolved at send time.
create table if not exists email_campaigns (
  id           text primary key,
  org_id       text not null references orgs(id) on delete cascade,
  name         text not null default 'Untitled campaign',
  subject      text not null default '',
  preheader    text not null default '',
  document     jsonb not null default '{}'::jsonb,
  audience     jsonb not null default '{}'::jsonb,
  status       text not null default 'draft',  -- draft|scheduled|sending|sent|failed
  scheduled_at timestamptz,
  sent_at      timestamptz,
  stats        jsonb not null default '{}'::jsonb, -- {recipients,delivered,opens,clicks}
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_email_campaigns_org on email_campaigns(org_id, created_at desc);
create index if not exists idx_email_campaigns_due
  on email_campaigns(scheduled_at) where status = 'scheduled';

-- Per-recipient engagement, keyed by email (there's no separate contacts
-- table -- the audience is the existing newsletter/customer records). Powers
-- campaign stats and the per-recipient profile view.
create table if not exists email_events (
  id           text primary key,
  org_id       text not null references orgs(id) on delete cascade,
  campaign_id  text references email_campaigns(id) on delete cascade,
  contact_email text not null,
  type         text not null,        -- delivered|open|click|bounce|unsubscribe
  url          text,                 -- for click events
  at           timestamptz not null default now()
);
create index if not exists idx_email_events_campaign on email_events(campaign_id);
create index if not exists idx_email_events_contact on email_events(org_id, contact_email, at desc);

-- Suppression: emails that must never be sent to again (unsubscribes,
-- hard bounces). Checked at send time.
create table if not exists email_suppressions (
  org_id        text not null references orgs(id) on delete cascade,
  contact_email text not null,
  reason        text not null default 'unsubscribe',
  at            timestamptz not null default now(),
  primary key (org_id, contact_email)
);
