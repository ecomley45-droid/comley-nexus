import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

// Floor staff / sellers who aren't necessarily CMS users -- a name-only list
// used to attribute manual sales. Org-scoped.
const col = (orgId) => `staff__${orgId || 'default'}`;
const COLS = 'id, name, active';

export async function listStaff(orgId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_staff').select(COLS).eq('org_id', orgId).order('name', { ascending: true });
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId));
}

export async function createStaff(orgId, input) {
  const row = {
    id: `stf-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    org_id: orgId, name: input.name || 'Unnamed', active: input.active ?? true,
    created_at: new Date().toISOString(),
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_staff').insert(row).select(COLS).single();
    if (error) throw error;
    return data;
  }
  const rows = readCollection(col(orgId)); rows.push(row); writeCollection(col(orgId), rows);
  return row;
}

export async function updateStaff(orgId, id, patch) {
  const { org_id, id: _i, ...safe } = patch;
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_staff').update(safe).eq('org_id', orgId).eq('id', id).select(COLS).maybeSingle();
    if (error) throw error;
    return data;
  }
  const rows = readCollection(col(orgId));
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...safe }; writeCollection(col(orgId), rows);
  return rows[idx];
}

export async function deleteStaff(orgId, id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('store_staff').delete().eq('org_id', orgId).eq('id', id).select('id');
    if (error) throw error;
    return (data || []).length > 0;
  }
  const rows = readCollection(col(orgId));
  const next = rows.filter((r) => r.id !== id);
  writeCollection(col(orgId), next);
  return next.length !== rows.length;
}
