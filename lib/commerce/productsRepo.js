import { v4 as uuid } from 'uuid';
import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

const COLLECTION = 'products';

export async function listProducts() {
  if (hasSupabase) {
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION);
}

export async function getProduct(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION).find((p) => p.id === id) || null;
}

export async function createProduct(input) {
  const now = new Date().toISOString();
  const product = {
    id: uuid(),
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
  const products = readCollection(COLLECTION);
  products.unshift(product);
  writeCollection(COLLECTION, products);
  return product;
}

export async function updateProduct(id, patch) {
  const updated_at = new Date().toISOString();
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('products')
      .update({ ...patch, updated_at })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  const products = readCollection(COLLECTION);
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  products[idx] = { ...products[idx], ...patch, updated_at };
  writeCollection(COLLECTION, products);
  return products[idx];
}

export async function deleteProduct(id) {
  if (hasSupabase) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const products = readCollection(COLLECTION);
  const next = products.filter((p) => p.id !== id);
  const removed = next.length !== products.length;
  writeCollection(COLLECTION, next);
  return removed;
}
