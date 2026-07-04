-- Multi-tenant migration. Adds an `orgs` table and threads `org_id` through
-- every content-holding table. Backfills all existing rows into Ethan's
-- bootstrap org ('admin'), so the /admin/* URL keeps working end-to-end.
--
-- After this migration:
--   - orgs.id (text, matches the URL slug) is the canonical tenant key
--   - Every content table has org_id NOT NULL with FK to orgs(id)
--   - Old rows all belong to org 'admin'
--   - New rows must specify org_id -- server-side scoping enforced in
--     lib/storage.js (no client-provided org_id ever accepted)
--
-- Safe to re-run. All operations use IF NOT EXISTS or ALTER ... ADD COLUMN
-- IF NOT EXISTS.

-- ---------- orgs ----------
create table if not exists orgs (
  id text primary key,                  -- Matches the URL slug (e.g. 'admin', 'acme')
  name text not null,
  domain text,                          -- Optional custom domain (e.g. cms.acmeco.com)
  plan text not null default 'starter',
  feature_flags jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed Ethan's bootstrap org so the backfill below has somewhere to point.
insert into orgs (id, name, plan, feature_flags)
values ('admin', 'Comley Creative', 'internal', '{"commerce_enabled": false}')
on conflict (id) do nothing;

-- ---------- org_members (Clerk-user-email -> org, with role) ----------
create table if not exists org_members (
  org_id text not null references orgs(id) on delete cascade,
  user_email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (org_id, user_email)
);

insert into org_members (org_id, user_email, role, joined_at)
values ('admin', 'ethanfcomley@gmail.com', 'admin', now())
on conflict do nothing;

create index if not exists idx_org_members_email on org_members(user_email);

-- ---------- Add org_id to every content table ----------
-- Each ALTER adds the column with a default so the backfill fills in
-- automatically, then drops the default so future inserts must be explicit.

do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'pages', 'page_versions', 'library_entries', 'redirects',
    'section_comments', 'ab_stats', 'team_members', 'audit_log',
    'media', 'feedback', 'feedback_comments', 'systems',
    'user_preferences', 'repos', 'repo_branches', 'git_pulls'
  ])
  loop
    execute format(
      'alter table %I add column if not exists org_id text not null default %L',
      tbl, 'admin'
    );
    execute format(
      'alter table %I alter column org_id drop default',
      tbl
    );
    -- FK constraint (idempotent via drop-if-exists then add).
    execute format(
      'alter table %I drop constraint if exists fk_%I_org',
      tbl, tbl
    );
    execute format(
      'alter table %I add constraint fk_%I_org foreign key (org_id) references orgs(id) on delete cascade',
      tbl, tbl
    );
    execute format(
      'create index if not exists idx_%I_org on %I(org_id)',
      tbl, tbl
    );
  end loop;
end $$;

-- ---------- Global settings becomes per-org ----------
-- The old singleton row (id=1) belonged to Ethan. Move its data into a
-- per-org row and change the primary key from id (smallint) to org_id.

do $$
begin
  -- If we haven't yet migrated global_settings, do it now.
  if exists (select 1 from information_schema.columns
             where table_name = 'global_settings' and column_name = 'id') then
    -- Add org_id column pointing at the bootstrap org.
    alter table global_settings add column if not exists org_id text;
    update global_settings set org_id = 'admin' where org_id is null;
    -- Enforce it.
    alter table global_settings alter column org_id set not null;
    -- Drop old primary key and add the new one.
    alter table global_settings drop constraint if exists global_settings_pkey;
    alter table global_settings add constraint global_settings_pkey primary key (org_id);
    -- Foreign key.
    alter table global_settings drop constraint if exists fk_global_settings_org;
    alter table global_settings add constraint fk_global_settings_org
      foreign key (org_id) references orgs(id) on delete cascade;
    -- The old id column can go now.
    alter table global_settings drop column if exists id;
  end if;
end $$;

-- Ensure Ethan's org has a settings row.
insert into global_settings (org_id, site_name)
values ('admin', 'Comley Creative')
on conflict (org_id) do nothing;

-- ---------- User preferences: scope by (org_id, user_email) ----------
-- Same user email can be a member of multiple orgs with different prefs.
-- Change PK from user_email to (org_id, user_email).
do $$
begin
  if exists (select 1 from information_schema.table_constraints
             where table_name = 'user_preferences'
             and constraint_type = 'PRIMARY KEY'
             and constraint_name = 'user_preferences_pkey') then
    -- Only run if the current PK is just user_email.
    if (select array_agg(column_name::text order by ordinal_position)
          from information_schema.key_column_usage
         where table_name = 'user_preferences'
           and constraint_name = 'user_preferences_pkey') = array['user_email'] then
      alter table user_preferences drop constraint user_preferences_pkey;
      alter table user_preferences add constraint user_preferences_pkey
        primary key (org_id, user_email);
    end if;
  end if;
end $$;
