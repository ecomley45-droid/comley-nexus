import { v4 as uuid } from 'uuid';
import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

// Org-scoped. Orders carry org_id (set at creation from the product/cart's
// workspace). Lookups by unique id / payment-intent don't need an org filter.
const col = (orgId) => `orders__${orgId || 'default'}`;

export async function listOrders(orgId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('orders').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId));
}

export async function getOrder(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(col(null)).find((o) => o.id === id) || null;
}

export async function getOrderByPaymentIntent(paymentIntentId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('orders').select('*').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(col(null)).find((o) => o.stripe_payment_intent_id === paymentIntentId) || null;
}

export async function createOrder(input) {
  const now = new Date().toISOString();
  const order = {
    id: uuid(),
    org_id: input.org_id ?? null,
    customer_id: input.customer_id ?? null,
    customer_email: input.customer_email ?? null,
    items: input.items || [],
    total: input.total,
    status: input.status || 'pending',
    campaign_code: input.campaign_code ?? null,
    stripe_payment_intent_id: input.stripe_payment_intent_id ?? null,
    created_at: now,
    updated_at: now,
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from('orders').insert(order).select().single();
    if (error) throw error;
    return data;
  }
  const orders = readCollection(col(order.org_id));
  orders.unshift(order);
  writeCollection(col(order.org_id), orders);
  return order;
}

export async function updateOrderStatus(orgId, id, status) {
  const updated_at = new Date().toISOString();
  if (hasSupabase) {
    let q = supabase.from('orders').update({ status, updated_at }).eq('id', id);
    if (orgId) q = q.eq('org_id', orgId);
    const { data, error } = await q.select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const orders = readCollection(col(orgId));
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], status, updated_at };
  writeCollection(col(orgId), orders);
  return orders[idx];
}
