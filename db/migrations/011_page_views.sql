-- Built-in, cookieless page-view analytics. A tiny beacon injected into
-- every published page (see compilePageHtml) POSTs to /api/public/pv;
-- views aggregate per org/day/path -- no visitor identifiers, no cookies,
-- nothing that needs a consent banner.
--
-- increment_page_view exists because PostgREST upserts can't express
-- `views = views + 1`; a SECURITY DEFINER function keeps it one round trip.
--
-- Safe to re-run: IF NOT EXISTS + CREATE OR REPLACE.

create table if not exists page_views (
  org_id text not null references orgs(id) on delete cascade,
  day date not null,
  path text not null default '',
  views integer not null default 0,
  primary key (org_id, day, path)
);

create index if not exists idx_page_views_org_day on page_views(org_id, day desc);

create or replace function increment_page_view(p_org_id text, p_path text)
returns void
language sql
security definer
as $$
  insert into page_views (org_id, day, path, views)
  values (p_org_id, current_date, p_path, 1)
  on conflict (org_id, day, path)
  do update set views = page_views.views + 1;
$$;
