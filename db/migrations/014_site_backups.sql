-- Whole-site restore points. The existing nexus_page_versions table (see
-- 013_site_pages.sql / lib/storage.js versions) is PER-PAGE (keyed page_id,
-- max 20 each) and captures neither the theme nor page deletions -- wrong
-- shape for "roll my entire site back to before I installed a template".
--
-- A backup is a full snapshot of one workspace at a moment: every page
-- (pages jsonb, the same shape storage.pages.list returns) plus the whole
-- global_settings object (settings jsonb, the shape storage.settings.get
-- returns -- theme, globals, analytics, siteName...). Restoring is just
-- bulkReplace(pages) + settings.replace(settings).
--
-- Created automatically before every template install and before every
-- restore (so a restore is itself undoable), and manually from the Backups
-- panel. Pruned to the most recent N per org by backupsStore.prune().
--
-- Safe to re-run: IF NOT EXISTS everywhere.

create table if not exists site_backups (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  label text not null default '',
  -- 'manual' | 'pre-install' | 'pre-restore' -- drives the icon/copy shown
  -- in the Backups list, never any branching logic.
  reason text not null default 'manual',
  pages jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_site_backups_org on site_backups(org_id, created_at desc);
