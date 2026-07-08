import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

// Per-(product, location) stock. The inventory manager UI merges these rows
// with the product list to show a product x location grid + per-product total.
const col = (orgId) => `inventory__${orgId || 'default'}`;
const COLS = 'id, product_id, location_id, quantity';
const rid = () => `inv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export async function listInventory(orgId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('product_inventory').select(COLS).eq('org_id', orgId);
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId));
}

// Set the absolute quantity for one product at one location (upsert).
export async function setQuantity(orgId, productId, locationId, quantity) {
  const qty = Math.max(0, Math.round(Number(quantity) || 0));
  if (hasSupabase) {
    const { data, error } = await supabase.from('product_inventory')
      .upsert({ id: rid(), org_id: orgId, product_id: productId, location_id: locationId, quantity: qty, updated_at: new Date().toISOString() },
        { onConflict: 'product_id,location_id' })
      .select(COLS).single();
    if (error) throw error;
    return data;
  }
  const rows = readCollection(col(orgId));
  const idx = rows.findIndex((r) => r.product_id === productId && r.location_id === locationId);
  if (idx === -1) { const row = { id: rid(), product_id: productId, location_id: locationId, quantity: qty }; rows.push(row); writeCollection(col(orgId), rows); return row; }
  rows[idx] = { ...rows[idx], quantity: qty }; writeCollection(col(orgId), rows);
  return rows[idx];
}

// Relative adjustment (e.g. -qty on a sale). Clamped at 0. Best-effort read+set.
export async function adjustQuantity(orgId, productId, locationId, delta) {
  const rows = await listInventory(orgId);
  const current = rows.find((r) => r.product_id === productId && r.location_id === locationId)?.quantity || 0;
  return setQuantity(orgId, productId, locationId, current + delta);
}
