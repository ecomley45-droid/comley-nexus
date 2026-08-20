-- Index orgs(domain).
--
-- Every public request that isn't on the platform's own default host was
-- resolving its workspace by pulling ALL orgs (storage.orgs.list(), no
-- limit) and filtering client-side for a domain match -- an unbounded,
-- full-table scan on the hottest path in the app, run on every single
-- public page view. Fixed in code by orgs.findByDomain(), which needs this
-- index to actually be an index lookup rather than a sequential scan.
--
-- Partial: only custom-domain rows are ever looked up this way (the
-- platform-default / no-custom-domain orgs are resolved by id, already
-- indexed via the primary key), and most orgs have no domain set.

create index if not exists idx_orgs_domain on orgs(domain) where domain is not null;
