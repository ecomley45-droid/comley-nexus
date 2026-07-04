-- Splits the platform ("Nexus") from its first client ("Comley Creative").
-- Before this migration, org id 'admin' conflated three unrelated things:
-- super-admin rights (via ADMIN_EMAILS), the "Comley Creative" client org,
-- and the hardcoded PUBLIC_ORG_ID for the public site. This migration:
--
--   1. Renames org 'admin' -> 'comley-creative' (same name/content, new id),
--      so Comley Creative becomes an ordinary tenant org like any future
--      client.
--   2. Creates a standalone set of `nexus_*` tables -- NOT part of the
--      `orgs` multi-tenant system (no org_id, no FK to orgs) -- to hold
--      Nexus's own editable site pages. Access is gated purely by
--      ADMIN_EMAILS (requireSuperAdmin), never by org membership.
--
-- Safe to re-run: rename step is a no-op once 'admin' no longer exists;
-- table creation uses IF NOT EXISTS.

-- ---------- 1. Rename org 'admin' -> 'comley-creative' ----------
do $$
declare
  tbl text;
begin
  if exists (select 1 from orgs where id = 'admin') then
    insert into orgs (id, name, domain, plan, feature_flags)
    select 'comley-creative', name, domain, plan, feature_flags
    from orgs where id = 'admin'
    on conflict (id) do nothing;

    for tbl in select unnest(array[
      'pages', 'page_versions', 'library_entries', 'redirects',
      'section_comments', 'ab_stats', 'team_members', 'audit_log',
      'media', 'feedback', 'feedback_comments', 'systems',
      'user_preferences', 'repos', 'repo_branches', 'git_pulls',
      'org_members', 'global_settings'
    ])
    loop
      execute format('update %I set org_id = %L where org_id = %L', tbl, 'comley-creative', 'admin');
    end loop;

    delete from orgs where id = 'admin';
  end if;
end $$;

-- ---------- 2. Nexus platform tables (no org_id, no FK to orgs) ----------
create table if not exists nexus_pages (
  id text primary key,
  name text not null default 'Untitled page',
  slug text not null,
  parent_id text references nexus_pages(id) on delete set null,
  content jsonb not null default '[]',
  seo jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  scheduled_publish_at bigint,
  analytics jsonb not null default '{}',
  layout jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nexus_pages_slug on nexus_pages(slug);
create index if not exists idx_nexus_pages_parent on nexus_pages(parent_id);
create index if not exists idx_nexus_pages_status on nexus_pages(status);

create table if not exists nexus_page_versions (
  id text primary key,
  page_id text not null,
  taken_at timestamptz not null default now(),
  snapshot jsonb not null
);
create index if not exists idx_nexus_page_versions_page on nexus_page_versions(page_id, taken_at desc);

create table if not exists nexus_library_entries (
  id text primary key,
  name text not null,
  html text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists nexus_redirects (
  id text primary key,
  from_path text unique not null,
  to_path text not null,
  type smallint not null default 302 check (type in (301, 302)),
  created_at timestamptz not null default now()
);

-- Singleton settings row for Nexus's own site.
create table if not exists nexus_settings (
  id boolean primary key default true check (id),
  site_name text not null default 'Nexus',
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into nexus_settings (id, site_name) values (true, 'Nexus')
on conflict (id) do nothing;
