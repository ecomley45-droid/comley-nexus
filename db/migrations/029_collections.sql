-- Content collections: user-defined content types.
--
-- Until now the only structured content a workspace could manage was
-- whatever the platform had hard-coded a table for -- events (021) and
-- products (023). Anything else ("case studies", "recipes", "properties",
-- "job openings") had to be retyped by hand into a card-grid's items on
-- every page it appeared. That's the difference between a site builder and
-- a CMS, and this is the table that closes it.
--
-- Two tables, deliberately schemaless in the payload:
--
--   collections       the type: name, slug, and a `fields` array describing
--                     what an entry looks like ([{key,label,type,...}]).
--                     `detail_*` controls whether entries get their own
--                     pages and what template renders them.
--
--   collection_entries the records: `data` is a jsonb bag keyed by field key.
--                     Validated in lib/collections.js against the parent's
--                     field list on every write, so the bag can't drift from
--                     the declared shape.
--
-- Both are org-scoped like every other table in lib/storage.js. Entries
-- cascade with their collection: deleting the type deletes its content, which
-- is what "delete this collection" has to mean.

create table if not exists collections (
  id           text primary key,
  org_id       text not null,
  name         text not null,
  slug         text not null,
  description  text default '',
  -- [{ key, label, type, required, options?, help? }] -- see FIELD_TYPES in
  -- src/shared/collectionFields.js for the closed set of `type` values.
  fields       jsonb not null default '[]'::jsonb,
  -- Whether each entry gets its own URL, and under which path segment.
  -- e.g. detail_base 'case-studies' -> /case-studies/<entry slug>
  detail_enabled boolean not null default false,
  detail_base    text default '',
  -- Page whose blocks render a single entry (its blocks read {{field}}
  -- placeholders). Null while detail pages are off.
  detail_page_id text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists collections_org_slug_idx on collections (org_id, slug);
create index if not exists collections_org_idx on collections (org_id);

create table if not exists collection_entries (
  id            text primary key,
  org_id        text not null,
  collection_id text not null references collections (id) on delete cascade,
  slug          text not null,
  -- 'draft' entries are editable but never rendered on the public site.
  status        text not null default 'published',
  data          jsonb not null default '{}'::jsonb,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists collection_entries_slug_idx
  on collection_entries (collection_id, slug);
create index if not exists collection_entries_org_idx on collection_entries (org_id);
create index if not exists collection_entries_lookup_idx
  on collection_entries (collection_id, status, sort_order);

-- The block that renders a collection. Like every other catalog row, `html`
-- is never stored -- it's derived client-side from default_fields.
insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order)
values (
  'collection-list', null, 'collection-list', 'Collection List', 'Content',
  'Shows entries from one of your collections. Pick the collection and a layout; the entries stay in sync automatically.',
  '{"headings":["Latest"],"layout":"cards","limit":6,"items":[]}'::jsonb,
  36
)
on conflict (id) do nothing;
