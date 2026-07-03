-- CMS schema for comley-builder. Replaces the file-based storage in
-- data/*.json so the app can run on Vercel serverless (which has no
-- persistent filesystem). Apply after schema.sql (commerce tables).
--
-- Single-tenant for now. When adding the second client, add an `org_id`
-- column to every table below and enable RLS scoped to the caller's Clerk
-- organization id. Doing that as a separate migration keeps this file
-- readable.

create extension if not exists "pgcrypto";

-- ---------- Pages ----------
-- IDs are the string form the app already generates ('page-<ts>-<rand>')
-- so we don't have to touch every client that references them.
create table if not exists pages (
  id text primary key,
  name text not null default 'Untitled page',
  slug text not null,
  parent_id text references pages(id) on delete set null,
  content jsonb not null default '[]',
  seo jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  scheduled_publish_at bigint,
  analytics jsonb not null default '{}',
  layout jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pages_slug on pages(slug);
create index if not exists idx_pages_parent on pages(parent_id);
create index if not exists idx_pages_status on pages(status);

-- Snapshots of the PREVIOUS state of a page before each save. "Restore"
-- means "swap current page state for the saved snapshot".
create table if not exists page_versions (
  id text primary key,
  page_id text not null,
  taken_at timestamptz not null default now(),
  snapshot jsonb not null
);
create index if not exists idx_page_versions_page on page_versions(page_id, taken_at desc);

-- ---------- Library (reusable section templates) ----------
create table if not exists library_entries (
  id text primary key,
  name text not null,
  html text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Media (metadata; actual bytes in Supabase Storage bucket) ----------
create table if not exists media (
  id text primary key,
  name text not null,
  filename text not null,
  mime_type text not null,
  size bigint not null default 0,
  url text not null,
  uploaded_at timestamptz not null default now()
);

-- ---------- Redirects ----------
create table if not exists redirects (
  id text primary key,
  from_path text unique not null,
  to_path text not null,
  type smallint not null default 302 check (type in (301, 302)),
  created_at timestamptz not null default now()
);

-- ---------- Inline review comments on page sections ----------
create table if not exists section_comments (
  id text primary key,
  page_id text not null,
  section_id text not null,
  body text not null,
  author text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_section_comments_page on section_comments(page_id);

-- ---------- A/B stats ----------
-- Composite pk (section, variant). Impressions/clicks bumped via upsert +
-- add-on-conflict pattern for atomic counter increments.
create table if not exists ab_stats (
  section_id text not null,
  variant_id text not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  primary key (section_id, variant_id)
);

-- ---------- Team roster ----------
create table if not exists team_members (
  id text primary key,
  name text not null,
  email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  added_at timestamptz not null default now()
);

-- ---------- Audit log ----------
create table if not exists audit_log (
  id text primary key,
  action text not null,
  details text,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_created on audit_log(created_at desc);

-- ---------- Feedback tickets (from FeedbackWidget) ----------
create table if not exists feedback (
  id text primary key,
  type text not null check (type in ('bug', 'non_functioning', 'critical', 'feature_request')),
  description text not null,
  expected_behavior text,
  current_behavior text,
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'in_progress', 'sent_to_agent', 'resolved', 'closed')),
  area text not null default 'cms',
  path text,
  reported_role text,
  reported_by text,
  screenshot_url text,
  image_urls jsonb not null default '[]',
  assignee_email text,
  system_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_feedback_status on feedback(status);
create index if not exists idx_feedback_assignee on feedback(assignee_email);
create index if not exists idx_feedback_system on feedback(system_id);

-- Threaded comments on feedback tickets. author-only edit/delete
-- enforcement lives in code (60-second window).
create table if not exists feedback_comments (
  id text primary key,
  feedback_id text not null references feedback(id) on delete cascade,
  author_email text not null,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_feedback_comments_feedback on feedback_comments(feedback_id, created_at);

-- ---------- Systems (Ops board — Status + Feature Requests) ----------
create table if not exists systems (
  id text primary key,
  name text not null,
  status text not null default 'operational' check (status in ('operational', 'degraded', 'down', 'maintenance')),
  description text,
  category text
);

-- ---------- User preferences (per-viewer settings) ----------
-- Keyed by Clerk email (unique enough for single-tenant). Two JSONB blobs
-- kept shallow-merged in code so the client can PATCH slices.
create table if not exists user_preferences (
  user_email text primary key,
  view_mode text default 'list',
  detail_mode text default 'panel',
  schedule_layout jsonb not null default '{}',
  integrations jsonb not null default '{}',
  ai_settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------- Git pull tracker ----------
create table if not exists repos (
  id text primary key,
  name text not null,
  url text
);

create table if not exists repo_branches (
  id text primary key,
  repo_id text not null references repos(id) on delete cascade,
  name text not null
);

create table if not exists git_pulls (
  id text primary key,
  branch_id text not null references repo_branches(id) on delete cascade,
  user_email text not null,
  pulled_at timestamptz not null default now()
);
create index if not exists idx_git_pulls_branch on git_pulls(branch_id, pulled_at desc);

-- ---------- Global site settings (singleton row) ----------
create table if not exists global_settings (
  id smallint primary key default 1 check (id = 1),
  site_name text not null default 'Comley Builder',
  theme jsonb not null default '{"primary":"#6366f1","secondary":"#d946ef","bg":"#070a13","text":"#e2e8f0"}',
  analytics jsonb not null default '{"headSnippet":"","bodySnippet":""}',
  globals jsonb not null default '{}',
  favicon text,
  default_og_image text,
  timezone text default 'UTC',
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);
-- Seed the singleton so the app can always read one row.
insert into global_settings (id) values (1) on conflict (id) do nothing;
