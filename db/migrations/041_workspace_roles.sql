-- Workspace custom roles (RBAC).
--
-- Until now authorization was a fixed linear rank: org_members.role was one of
-- viewer/editor/admin, checked by requireRole(). This adds workspace-defined
-- custom roles carrying a per-page/per-feature permission matrix (see
-- src/shared/permissions.js for the shape and the can() checker).
--
-- Design:
--   - viewer/editor/admin stay "system" roles. They are NOT stored here --
--     their permissions are computed by defaultPermissionsForSystemRole() so
--     existing members keep working with zero data migration. `admin` remains
--     the immutable owner tier (full access, manages roles + billing).
--   - Custom roles live in this table, one row per (org_id, id). Their `id`
--     is the slug stored in org_members.role.
--
-- Because custom role slugs now appear in org_members.role (and the roster
-- mirror team_members.role), the old CHECK (role in ('viewer','editor','admin'))
-- constraints must go. Both drops are `if exists` so this is safe to re-run and
-- a no-op where the constraint was already removed.
--
-- Additive and idempotent throughout.

create table if not exists roles (
  org_id text not null references orgs(id) on delete cascade,
  id text not null,                       -- slug stored in org_members.role
  name text not null,
  permissions jsonb not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create index if not exists idx_roles_org on roles(org_id);

-- Allow custom role slugs in the membership tables. The constraint on
-- org_members was declared inline in 003 (auto-named org_members_role_check).
-- team_members may or may not carry an equivalent; drop it defensively.
alter table org_members drop constraint if exists org_members_role_check;
alter table team_members drop constraint if exists team_members_role_check;
