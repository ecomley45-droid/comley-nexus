import { v4 as uuid } from 'uuid';
import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

const COLLECTION = 'customers';

export async function listCustomers() {
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION);
}

export async function getCustomerById(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION).find((c) => c.id === id) || null;
}

export async function updateCustomerTier(id, tier) {
  const updated_at = new Date().toISOString();
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('customers')
      .update({ tier, updated_at })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  const customers = readCollection(COLLECTION);
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  customers[idx] = { ...customers[idx], tier, updated_at };
  writeCollection(COLLECTION, customers);
  return customers[idx];
}

export async function getCustomerByClerkId(clerkId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers').select('*').eq('clerk_id', clerkId).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION).find((c) => c.clerk_id === clerkId) || null;
}

export async function getCustomerByEmail(email) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers').select('*').eq('email', email).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION).find((c) => c.email === email) || null;
}

// Upsert by clerk_id — used by both the Clerk webhook and local dev mode
// (where "logging in" just means the client sends an X-Customer-Id header).
export async function upsertCustomer({ clerkId, email, tier }) {
  const now = new Date().toISOString();
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('customers')
      .upsert(
        { clerk_id: clerkId, email, tier: tier || 'customer', updated_at: now },
        { onConflict: 'clerk_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const customers = readCollection(COLLECTION);
  const idx = customers.findIndex((c) => c.clerk_id === clerkId);
  if (idx === -1) {
    const customer = {
      id: uuid(),
      clerk_id: clerkId,
      email,
      tier: tier || 'customer',
      lifetime_value: 0,
      created_at: now,
      updated_at: now,
    };
    customers.unshift(customer);
    writeCollection(COLLECTION, customers);
    return customer;
  }
  customers[idx] = { ...customers[idx], email, tier: tier || customers[idx].tier, updated_at: now };
  writeCollection(COLLECTION, customers);
  return customers[idx];
}

export async function addLifetimeValue(customerId, amount) {
  if (!customerId) return null;
  if (hasSupabase) {
    const { data: current, error: readError } = await supabase
      .from('customers')
      .select('lifetime_value')
      .eq('id', customerId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return null;
    const { data, error } = await supabase
      .from('customers')
      .update({ lifetime_value: Number(current.lifetime_value || 0) + amount })
      .eq('id', customerId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  const customers = readCollection(COLLECTION);
  const idx = customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return null;
  customers[idx].lifetime_value = Number(customers[idx].lifetime_value || 0) + amount;
  writeCollection(COLLECTION, customers);
  return customers[idx];
}
