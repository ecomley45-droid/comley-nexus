import { v4 as uuid } from 'uuid';
import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

// Physical store locations, org-scoped.
const col = (orgId) => `locations__${orgId || 'default'}`;
const COLS = 'id, name, address, phone, notes, active, sort_order';

export async function listLocations(orgId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_locations').select(COLS)
      .eq('org_id', orgId).order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId));
}

export async function createLocation(orgId, input) {
  const now = new Date().toISOString();
  const row = {
    id: `loc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    org_id: orgId, name: input.name || 'Untitled location', address: input.address || '',
    phone: input.phone || '', notes: input.notes || '', active: input.active ?? true,
    sort_order: input.sort_order ?? 0, created_at: now, updated_at: now,
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_locations').insert(row).select(COLS).single();
    if (error) throw error;
    return data;
  }
  const rows = readCollection(col(orgId)); rows.push(row); writeCollection(col(orgId), rows);
  return row;
}

export async function updateLocation(orgId, id, patch) {
  const { org_id, id: _i, ...safe } = patch;
  const updated_at = new Date().toISOString();
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_locations').update({ ...safe, updated_at })
      .eq('org_id', orgId).eq('id', id).select(COLS).maybeSingle();
    if (error) throw error;
    return data;
  }
  const rows = readCollection(col(orgId));
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...safe, updated_at }; writeCollection(col(orgId), rows);
  return rows[idx];
}

export async function deleteLocation(orgId, id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_locations').delete().eq('org_id', orgId).eq('id', id).select('id');
    if (error) throw error;
    return (data || []).length > 0;
  }
  const rows = readCollection(col(orgId));
  const next = rows.filter((r) => r.id !== id);
  writeCollection(col(orgId), next);
  return next.length !== rows.length;
}
