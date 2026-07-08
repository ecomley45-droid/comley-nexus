import { v4 as uuid } from 'uuid';
import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

// Org-scoped. A shopper can be a customer of multiple workspaces, so customers
// are keyed by (org_id, clerk_id). Lookups by clerk_id / email take an orgId.
// addLifetimeValue is keyed by the unique customer id.
const col = (orgId) => `customers__${orgId || 'default'}`;

export async function listCustomers(orgId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId));
}

export async function getCustomerById(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(col(null)).find((c) => c.id === id) || null;
}

export async function updateCustomerTier(orgId, id, tier) {
  const updated_at = new Date().toISOString();
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers')
      .update({ tier, updated_at }).eq('id', id).eq('org_id', orgId).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const customers = readCollection(col(orgId));
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  customers[idx] = { ...customers[idx], tier, updated_at };
  writeCollection(col(orgId), customers);
  return customers[idx];
}

export async function getCustomerByClerkId(orgId, clerkId) {
  if (!clerkId) return null;
  if (hasSupabase) {
    let q = supabase.from('customers').select('*').eq('clerk_id', clerkId);
    if (orgId) q = q.eq('org_id', orgId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId)).find((c) => c.clerk_id === clerkId) || null;
}

export async function getCustomerByEmail(orgId, email) {
  if (!email) return null;
  if (hasSupabase) {
    let q = supabase.from('customers').select('*').eq('email', email);
    if (orgId) q = q.eq('org_id', orgId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId)).find((c) => c.email === email) || null;
}

// Upsert by (org_id, clerk_id). Used by the Stripe/Clerk webhooks and dev mode.
export async function upsertCustomer({ orgId = null, clerkId, email, tier }) {
  const now = new Date().toISOString();
  if (hasSupabase) {
    const { data, error } = await supabase.from('customers')
      .upsert({ org_id: orgId, clerk_id: clerkId, email, tier: tier || 'customer', updated_at: now }, { onConflict: 'org_id,clerk_id' })
      .select().single();
    if (error) throw error;
    return data;
  }
  const customers = readCollection(col(orgId));
  const idx = customers.findIndex((c) => c.clerk_id === clerkId);
  if (idx === -1) {
    const customer = { id: uuid(), org_id: orgId, clerk_id: clerkId, email, tier: tier || 'customer', lifetime_value: 0, created_at: now, updated_at: now };
    customers.unshift(customer);
    writeCollection(col(orgId), customers);
    return customer;
  }
  customers[idx] = { ...customers[idx], email, tier: tier || customers[idx].tier, updated_at: now };
  writeCollection(col(orgId), customers);
  return customers[idx];
}

export async function addLifetimeValue(customerId, amount) {
  if (!customerId) return null;
  if (hasSupabase) {
    const { data: current, error: readError } = await supabase.from('customers').select('lifetime_value').eq('id', customerId).maybeSingle();
    if (readError) throw readError;
    if (!current) return null;
    const { data, error } = await supabase.from('customers')
      .update({ lifetime_value: Number(current.lifetime_value || 0) + amount }).eq('id', customerId).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const customers = readCollection(col(null));
  const idx = customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return null;
  customers[idx].lifetime_value = Number(customers[idx].lifetime_value || 0) + amount;
  writeCollection(col(null), customers);
  return customers[idx];
}
