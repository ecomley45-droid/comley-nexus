-- Storage for user-supplied API keys (Claude, ChatGPT) used by the
-- Integrations panel's "Connect" flow (see lib/apiKeys.js). Unlike
-- Google/GitHub/Slack -- which are OAuth logins handled entirely by Clerk's
-- own account-linking, with tokens held in Clerk, not this database -- these
-- two are key-based services with no login screen, so the key itself has to
-- live somewhere. NEVER exposed to the client: only a connected boolean
-- (GET /api/integrations/api-keys) is ever returned from server.js.
--
-- Safe to re-run: uses IF NOT EXISTS.

create table if not exists user_api_keys (
  org_id text not null references orgs(id) on delete cascade,
  user_email text not null,
  provider text not null check (provider in ('claude', 'chatgpt')),
  api_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_email, provider)
);

create index if not exists idx_user_api_keys_org on user_api_keys(org_id);
