-- Staging → live (UAT) publishing. When a workspace opts into staging
-- (feature_flags.staging_enabled), the CMS always edits a working copy the
-- public never sees; a "Deploy" promotes the current working state into a
-- site_deployments snapshot, and the public site serves the latest snapshot
-- while feature_flags.site_live is true. "Undeploy" flips site_live off and
-- the public shows a coming-soon placeholder.
--
-- Non-breaking: orgs without staging_enabled keep today's behaviour (edits to
-- published pages are live immediately). All the on/off + demo state lives in
-- the existing orgs.feature_flags jsonb, so only the snapshot table is new:
--   feature_flags.staging_enabled : opt into the UAT model
--   feature_flags.site_live       : deployed (public) vs offline
--   feature_flags.demo_mode       : hide the Deploy button, badge/lock features
--   feature_flags.coming_soon     : array of feature keys to badge "Coming soon"
--
-- Safe to re-run: IF NOT EXISTS.

-- One row per promotion. content_hash lets the UI show "you have undeployed
-- changes" by comparing the working copy's hash to the latest snapshot's.
create table if not exists site_deployments (
  id           text primary key,
  org_id       text not null references orgs(id) on delete cascade,
  pages        jsonb not null default '[]'::jsonb,
  library      jsonb not null default '[]'::jsonb,
  settings     jsonb not null default '{}'::jsonb,
  content_hash text,
  deployed_by  text,
  deployed_at  timestamptz not null default now()
);
-- The public render fetches the newest deployment per org constantly, so
-- index for that lookup.
create index if not exists idx_site_deployments_org on site_deployments(org_id, deployed_at desc);
