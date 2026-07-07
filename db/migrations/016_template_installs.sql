-- History of which templates a workspace has installed -- powers the
-- "My Templates" tab. Since installing COPIES the template's pages+theme
-- into the workspace (the workspace then owns and edits them), this table
-- is provenance + restore-point index, not a live link back to the
-- template. Each row points at the site_backup taken right before the
-- install, so "undo this install / go back to my previous site" is one
-- click from the history.
--
-- template_id is intentionally NOT a foreign key to nexus_site_templates:
-- a template can be soft-deleted later, but a workspace's record that it
-- once installed it must survive. template_name snapshots the name at
-- install time for display.
--
-- backup_id -> site_backups on delete set null: if the pre-install backup
-- is eventually pruned, the history row remains (its "restore" affordance
-- just goes away).
--
-- Safe to re-run: IF NOT EXISTS everywhere.

create table if not exists template_installs (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  template_id text not null,
  template_name text not null default '',
  installed_by text,
  backup_id text references site_backups(id) on delete set null,
  applied_theme boolean not null default true,
  installed_at timestamptz not null default now()
);

create index if not exists idx_template_installs_org on template_installs(org_id, installed_at desc);
