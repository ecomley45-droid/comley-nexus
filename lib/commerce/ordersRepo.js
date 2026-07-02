import { v4 as uuid } from 'uuid';
import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

const COLLECTION = 'orders';

export async function listOrders() {
  if (hasSupabase) {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION);
}

export async function getOrder(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION).find((o) => o.id === id) || null;
}

export async function getOrderByPaymentIntent(paymentIntentId) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION).find((o) => o.stripe_payment_intent_id === paymentIntentId) || null;
}

export async function createOrder(input) {
  const now = new Date().toISOString();
  const order = {
    id: uuid(),
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
  const orders = readCollection(COLLECTION);
  orders.unshift(order);
  writeCollection(COLLECTION, orders);
  return order;
}

export async function updateOrderStatus(id, status) {
  const updated_at = new Date().toISOString();
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  const orders = readCollection(COLLECTION);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], status, updated_at };
  writeCollection(COLLECTION, orders);
  return orders[idx];
}
