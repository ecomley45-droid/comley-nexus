-- Social layer: connect a workspace's social accounts, read their
-- performance, and compose / publish / schedule posts across platforms.
-- All four tables are org-scoped and cascade-delete with the org, mirroring
-- the conventions in 011_page_views / 012_product_block.
--
-- Access + refresh tokens are stored through lib/secretCrypto.js (the same
-- AES-256-GCM envelope as user_api_keys) -- the columns hold ciphertext,
-- never plaintext, and are NEVER returned to any client-facing route.
--
-- Safe to re-run: IF NOT EXISTS everywhere.

-- One connected account (a FB Page, IG Business account, X user, LinkedIn
-- org/member, TikTok account). external_id is the platform's own id, kept
-- so metrics + published-post lookups can address it later.
create table if not exists social_accounts (
  id            text primary key,
  org_id        text not null references orgs(id) on delete cascade,
  platform      text not null,          -- ig | fb | x | li | tt
  handle        text,                   -- @display, for the UI
  external_id   text,                   -- page / user / actor id at the platform
  access_token  text not null,          -- enc:v1:… (secretCrypto)
  refresh_token text,                   -- enc:v1:…  (null when the platform issues none)
  expires_at    timestamptz,            -- access-token expiry, drives proactive refresh
  scopes        text,
  sandbox       boolean not null default false,  -- connected via the runnable fake adapter
  connected_by  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_social_accounts_org on social_accounts(org_id);
create unique index if not exists idx_social_accounts_uniq
  on social_accounts(org_id, platform, external_id);

-- A composed post. `body` is the shared default text; `media` is a JSON
-- array of Media-library asset refs. Per-platform text/media overrides live
-- on the target rows below, so the composer's "customize per network" panels
-- map straight to columns.
create table if not exists social_posts (
  id           text primary key,
  org_id       text not null references orgs(id) on delete cascade,
  body         text not null default '',
  media        jsonb not null default '[]'::jsonb,
  status       text not null default 'draft',  -- draft|scheduled|publishing|done|failed
  scheduled_at timestamptz,                     -- null = publish now
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_social_posts_org on social_posts(org_id, created_at desc);
-- Partial index for the scheduler's "what's due" scan (see publish-due cron).
create index if not exists idx_social_posts_due
  on social_posts(scheduled_at)
  where status = 'scheduled';

-- One row per platform a post fans out to. Each carries its own status,
-- optional per-network override text/media, the platform's returned id (for
-- later metrics), and the last error. The composite PK makes a re-run of the
-- same target idempotent at the DB layer.
create table if not exists social_post_targets (
  post_id       text not null references social_posts(id) on delete cascade,
  account_id    text not null references social_accounts(id) on delete cascade,
  status        text not null default 'queued',  -- queued|publishing|sent|failed
  override_body text,                              -- null = use the post's shared body
  override_media jsonb,                            -- null = use the post's shared media
  external_id   text,                              -- returned post id at the platform
  external_url  text,                              -- permalink, when the platform returns one
  error         text,
  attempts      integer not null default 0,
  sent_at       timestamptz,
  primary key (post_id, account_id)
);

-- Daily performance snapshot, deliberately the same shape as page_views:
-- one row per account per day (account-level) plus optional per-post rows
-- keyed by the platform's post id. The dashboard aggregates these.
create table if not exists social_metrics (
  account_id       text not null references social_accounts(id) on delete cascade,
  day              date not null,
  post_external_id text not null default '',  -- '' = account-level row
  followers        integer,
  impressions      bigint not null default 0,
  engagements      bigint not null default 0,
  captured_at      timestamptz not null default now(),
  primary key (account_id, day, post_external_id)
);
create index if not exists idx_social_metrics_account_day
  on social_metrics(account_id, day desc);

-- Platform-wide "Add Block +" catalog entry for the Social Feed block. The
-- live posts are injected server-side (lib/social/feed.js); default_fields
-- just seeds the platform + count. ON CONFLICT DO NOTHING so re-runs are safe
-- and a Super-Admin edit to the row is never clobbered.
insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('social-feed', null, 'social-feed', 'Social Feed', 'Media',
   'Recent posts from a connected social account (Instagram, Facebook, X, LinkedIn or TikTok). Rendered server-side, so it works on the public site with no embed scripts. Connect the account under Social → Accounts first.',
   '{"platform":"ig","limit":6,"headings":["Follow along"]}'::jsonb, 22)
on conflict (id) do nothing;
