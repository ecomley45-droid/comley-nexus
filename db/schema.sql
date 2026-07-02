-- Paste into the Supabase SQL editor. Not auto-run by the app.
-- cart_sessions is intentionally NOT here — carts live in Upstash Redis
-- (lib/commerce/cart.js), keyed by session id with a 5 minute TTL.

create extension if not exists "pgcrypto";

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  email text unique not null,
  tier text not null default 'customer' check (tier in ('customer', 'wholesaler', 'admin')),
  lifetime_value numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique not null,
  description text,
  price numeric(12, 2) not null,
  wholesale_price numeric(12, 2),
  variants jsonb not null default '[]',
  collection_id uuid,
  inventory integer not null default 0,
  image_url text,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12, 2) not null,
  usage_limit integer,
  usage_count integer not null default 0,
  revenue_attributed numeric(12, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  items jsonb not null default '[]',
  total numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'cancelled')),
  campaign_code text references campaigns(code),
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_collection on products(collection_id);
create index if not exists idx_products_sku on products(sku);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_customers_clerk_id on customers(clerk_id);
