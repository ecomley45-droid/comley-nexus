-- Index the foreign keys Postgres does not index for you.
--
-- Postgres creates an index for a PRIMARY KEY and for a UNIQUE constraint,
-- but NOT for a FOREIGN KEY. That has two costs, and the second is the one
-- that bites without warning:
--
--   1. Every lookup by that column is a sequential scan.
--   2. Every DELETE on the PARENT table scans the whole child table to check
--      the constraint. Deleting one org, one social post or one backup gets
--      slower in proportion to data that has nothing to do with it.
--
-- Six of the schema's twenty-nine foreign keys had no index with that column
-- in the leading position. `product_inventory.location_id` is inside a
-- composite unique (product_id, location_id), which does not help a query or
-- a cascade keyed on location_id alone.
--
-- All are `if not exists` and none are unique, so this is safe to re-run and
-- cannot fail on existing data.

-- Membership is read on essentially every authenticated request, and the
-- only index here was on user_email — the wrong direction for "who is in
-- this org", and no help to `delete from orgs`.
create index if not exists idx_org_members_org on org_members(org_id);

-- Cascade target: deleting a backup had to scan every install row.
create index if not exists idx_template_installs_backup on template_installs(backup_id);

-- Covered for (product_id, location_id) but not location_id alone, which is
-- what "what stock is at this location" and the store_locations cascade use.
create index if not exists idx_product_inventory_location on product_inventory(location_id);

-- Read by post id on every publish and status poll, and both columns are
-- cascade targets.
create index if not exists idx_social_post_targets_post on social_post_targets(post_id);
create index if not exists idx_social_post_targets_account on social_post_targets(account_id);

-- Queried directly by org on every campaign send, to filter opt-outs.
create index if not exists idx_email_suppressions_org on email_suppressions(org_id, contact_email);

-- Two list views order by a timestamp across the whole table with nothing to
-- order by. Descending, because both are read newest-first.
create index if not exists idx_nexus_media_uploaded on nexus_media(uploaded_at desc);
create index if not exists idx_nexus_library_created on nexus_library_entries(created_at desc);
