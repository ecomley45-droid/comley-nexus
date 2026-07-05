-- Adds a pause switch for client workspaces (Super Admin lifecycle
-- control). Paused behavior is deliberately soft: no forced sign-out, no
-- session revocation -- an already-open tab keeps working until its next
-- API call, which then gets a 423 instead of real data (see requireOrg in
-- server.js and lib/ops/routes.js). The public site shows the same
-- generic "something went wrong" page instead of that org's content
-- (see resolvePublicSite in server.js).
--
-- Safe to re-run: uses IF NOT EXISTS.

alter table orgs add column if not exists paused boolean not null default false;
