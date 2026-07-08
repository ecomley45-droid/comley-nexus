import { v4 as uuid } from 'uuid';
import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

// Org-scoped: every list/create/update/delete takes an orgId so each workspace
// has its own catalog. getProduct(id) stays keyed by the (globally unique) id
// so the public Product-block buy flow can resolve a product without knowing
// the org up front (it reads product.org_id afterward).
const col = (orgId) => `products__${orgId || 'default'}`;

export async function listProducts(orgId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('products').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId));
}

export async function getProduct(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(col(null)).find((p) => p.id === id) || null;
}

export async function createProduct(orgId, input) {
  const now = new Date().toISOString();
  const product = {
    id: uuid(),
    org_id: orgId,
    name: input.name,
    sku: input.sku,
    description: input.description || '',
    price: input.price,
    wholesale_price: input.wholesale_price ?? null,
    variants: input.variants || [],
    collection_id: input.collection_id ?? null,
    inventory: input.inventory ?? 0,
    image_url: input.image_url || '',
    status: input.status || 'active',
    created_at: now,
    updated_at: now,
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from('products').insert(product).select().single();
    if (error) throw error;
    return data;
  }
  const products = readCollection(col(orgId));
  products.unshift(product);
  writeCollection(col(orgId), products);
  return product;
}

export async function updateProduct(orgId, id, patch) {
  const updated_at = new Date().toISOString();
  const { org_id, id: _ignore, ...safe } = patch; // never let a patch move a product between orgs
  if (hasSupabase) {
    const { data, error } = await supabase.from('products')
      .update({ ...safe, updated_at }).eq('id', id).eq('org_id', orgId).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const products = readCollection(col(orgId));
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  products[idx] = { ...products[idx], ...safe, updated_at };
  writeCollection(col(orgId), products);
  return products[idx];
}

export async function deleteProduct(orgId, id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('products').delete().eq('id', id).eq('org_id', orgId).select('id');
    if (error) throw error;
    return (data || []).length > 0;
  }
  const products = readCollection(col(orgId));
  const next = products.filter((p) => p.id !== id);
  const removed = next.length !== products.length;
  writeCollection(col(orgId), next);
  return removed;
}
