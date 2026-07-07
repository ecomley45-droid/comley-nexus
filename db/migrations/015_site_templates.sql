-- Site-template marketplace: browsable, installable starter sites. This is
-- the DB-backed successor to the hardcoded SITE_TEMPLATES array in
-- src/shared/siteTemplates.js -- that array still drives workspace creation
-- (POST /api/orgs templateId) and now ALSO seeds this table on first read
-- (see siteTemplateStore.list()), so nothing has to be hand-copied into SQL
-- here and the two can't drift.
--
-- org_id = null -> platform-wide, Super-Admin-authored, visible to every
--   workspace's marketplace. (Workspace-private templates -- a real org_id
--   -- are a deliberate later extension; the column exists so that never
--   needs another migration.)
--
-- payload jsonb is the source-of-truth site definition, stored at the
-- fields level (NOT rendered html): { pages: [{ name, slug, sections:
-- [{ name, blockType, fields }] }], theme: {...} } -- exactly the
-- pre-buildTemplateSite() shape. Install/preview re-render html through the
-- real blockRenderers so a renderer improvement is reflected everywhere
-- without a data migration (same reasoning as nexus_block_catalog).
--
-- feature_list jsonb is authored marketing copy: ["Feature one", ...]. The
-- block list shown on the detail page is DERIVED from payload, never stored.
--
-- Deletes are soft (is_active), consistent with nexus_block_catalog.
--
-- Safe to re-run: IF NOT EXISTS everywhere.

create table if not exists nexus_site_templates (
  id text primary key,
  org_id text references orgs(id) on delete cascade,
  slug text not null,
  name text not null,
  category text not null default 'Business',
  description text not null default '',
  feature_list jsonb not null default '[]',
  payload jsonb not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nexus_site_templates_active on nexus_site_templates(is_active);
create index if not exists idx_nexus_site_templates_org on nexus_site_templates(org_id);
