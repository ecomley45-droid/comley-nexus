-- Extend ops-facing tables with the columns their handlers reference.
-- All optional / defaulted so existing rows survive.

alter table systems
  add column if not exists display_order integer not null default 0,
  add column if not exists product text;

alter table repos
  add column if not exists platform text not null default 'GitHub',
  add column if not exists display_order integer not null default 0;

alter table repo_branches
  add column if not exists display_order integer not null default 0,
  add column if not exists last_pulled_by_email text,
  add column if not exists last_pulled_by_name text,
  add column if not exists last_pulled_at timestamptz;

alter table feedback
  add column if not exists assignee_name text,
  add column if not exists assignee_image text;
