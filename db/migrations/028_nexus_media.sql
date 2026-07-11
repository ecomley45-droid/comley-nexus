-- Media library for Nexus's own site. Mirrors the multi-tenant `media`
-- table (see db/schema_cms.sql) but stands alone in the `nexus_*` family:
-- no org_id, no FK to orgs, since there is exactly one Nexus site. The
-- actual bytes live in the shared `media` Supabase Storage bucket under a
-- `nexus/` folder; these rows hold only the metadata.
create table if not exists nexus_media (
  id text primary key,
  name text not null,
  filename text not null,
  mime_type text not null,
  size bigint not null default 0,
  url text not null,
  alt_text text not null default '',
  description text not null default '',
  uploaded_at timestamptz not null default now()
);
