-- Central events: a business manages multiple named calendars and their
-- events once, and any events/calendar/flyer block on any page can be bound
-- to a calendar (or "all") to display them. Org-scoped, multi-tenant like the
-- rest of lib/storage.js.
--
-- Blocks bound to a calendar are hydrated at page-serve time (see
-- lib/eventsHydrate.js) -- the stored block html is regenerated from live
-- events before the page is compiled, so "manage once, show everywhere"
-- stays live without re-saving pages.
--
-- Safe to re-run: IF NOT EXISTS everywhere.

create table if not exists calendars (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_calendars_org on calendars(org_id, sort_order);

create table if not exists events (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  calendar_id text references calendars(id) on delete cascade,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  flyer_url text not null default '',
  link_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_events_org on events(org_id, starts_at);
create index if not exists idx_events_calendar on events(calendar_id);
