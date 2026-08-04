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
-- has to treat them as possibly-edited and skip them forever. The platform
-- rows are shipped content that nobody has customised at this point, so clear
-- them and let the next marketplace read re-seed them from current code.
-- Workspace templates (org_id not null) are real user data and are untouched.
delete from nexus_site_templates
 where org_id is null
   and seed_hash is null;
