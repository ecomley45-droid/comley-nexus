-- Retail layer for commerce: physical store locations, floor staff (sellers),
-- per-location inventory, and manual/in-store orders that record the location
-- and salesperson. Org-scoped like the rest of commerce (migration 023).
--
-- Inventory is tracked per (product, location); the inventory manager also
-- shows a per-product total (sum across locations). products.inventory stays
-- as the legacy single number for the online Product-block flow.
--
-- Safe to re-run: IF NOT EXISTS everywhere.

create table if not exists store_locations (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  name text not null,
  address text not null default '',
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_store_locations_org on store_locations(org_id);

create table if not exists store_staff (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_store_staff_org on store_staff(org_id);

create table if not exists product_inventory (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  location_id text not null references store_locations(id) on delete cascade,
  quantity integer not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_product_inventory on product_inventory(product_id, location_id);
create index if not exists idx_product_inventory_org on product_inventory(org_id);

-- Manual/in-store orders record where and who sold them.
alter table orders add column if not exists location_id text;
alter table orders add column if not exists sold_by text;
alter table orders add column if not exists channel text not null default 'online';
