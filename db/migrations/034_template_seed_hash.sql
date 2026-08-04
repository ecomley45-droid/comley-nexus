-- Let platform templates track the code that defines them.
--
-- Marketplace platform rows (org_id is null) are seeded from SITE_TEMPLATES
-- on first read. Seeding only ever inserted, so a template that CHANGED --
-- repaletted, or given new pages -- stayed frozen at whatever was in the
-- array the day its row was first written. Every workspace then installed a
-- stale copy with no indication anything was out of date.
--
-- Rewriting rows unconditionally is not the answer either: super-admins can
-- edit platform templates through PATCH /api/templates/:id, and clobbering
-- that on the next page load would be worse than the staleness.
--
-- So each seeded row records the fingerprint of what was written. A row whose
-- content still matches its fingerprint is untouched and gets refreshed from
-- code; one that no longer matches has been edited and is left alone.
--
-- is_active is deliberately not part of it, so deactivating a platform
-- template still hides it and survives every refresh.

alter table nexus_site_templates
  add column if not exists seed_hash text;

-- Rows seeded before this column existed have no fingerprint, so the refresh
-- has to treat them as possibly-edited and skip them forever. Clearing them
-- lets the next marketplace read re-seed them from current code.
--
-- Scoped to the ids the code actually ships. This originally deleted on
-- `org_id is null` alone, which was wrong and destructive: org_id null does
-- NOT mean "shipped content". Both /api/templates and
-- /api/templates/from-site write org_id null, so every template a super-admin
-- captured from one of their own sites lives here too, with an id like
-- tpl-<timestamp>-<random>. Those were deleted and nothing re-creates them —
-- template_installs records only a template id and name, never the payload,
-- so there is no in-app path back. Restoring them means a database backup.
delete from nexus_site_templates
 where org_id is null
   and seed_hash is null
   and id like 'seed-%';
