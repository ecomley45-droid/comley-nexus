-- Make commerce multi-tenant: scope products/orders/customers/campaigns to a
-- workspace (org_id). Previously these were global single-store tables.
--
-- Global uniques (sku, campaign code, customer clerk_id/email) become
-- per-org, and orders.campaign_code's FK is dropped (code is no longer
-- globally unique; it's stored as plain text and resolved per-org in the app).
--
-- Existing rows get a NULL org_id -- they belong to no workspace and simply
-- stop showing in any org-scoped view. (If you had real data under the old
-- single store, backfill org_id manually before relying on this.)
--
-- Safe to re-run: IF NOT EXISTS / IF EXISTS throughout.

alter table products  add column if not exists org_id text references orgs(id) on delete cascade;
alter table orders    add column if not exists org_id text references orgs(id) on delete cascade;
alter table customers add column if not exists org_id text references orgs(id) on delete cascade;
alter table campaigns add column if not exists org_id text references orgs(id) on delete cascade;

-- Drop the old global uniques. The orders->campaigns FK depends on
-- campaigns_code_key, so it MUST be dropped first.
alter table orders    drop constraint if exists orders_campaign_code_fkey;
alter table products  drop constraint if exists products_sku_key;
alter table campaigns drop constraint if exists campaigns_code_key;
alter table customers drop constraint if exists customers_clerk_id_key;
alter table customers drop constraint if exists customers_email_key;

-- Re-establish them per-org.
create unique index if not exists uq_products_org_sku    on products(org_id, sku);
create unique index if not exists uq_campaigns_org_code  on campaigns(org_id, code);
create unique index if not exists uq_customers_org_clerk on customers(org_id, clerk_id);

create index if not exists idx_products_org  on products(org_id);
create index if not exists idx_orders_org    on orders(org_id);
create index if not exists idx_customers_org on customers(org_id);
create index if not exists idx_campaigns_org on campaigns(org_id);
