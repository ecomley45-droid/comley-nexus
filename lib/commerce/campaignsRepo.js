import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

const COLLECTION = 'campaigns';

export async function listCampaigns() {
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION);
}

export async function createCampaign(input) {
  const campaign = {
    code: input.code,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    usage_limit: input.usage_limit ?? null,
    usage_count: 0,
    revenue_attributed: 0,
    active: input.active ?? true,
    created_at: new Date().toISOString(),
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').insert(campaign).select().single();
    if (error) throw error;
    return data;
  }
  const campaigns = readCollection(COLLECTION);
  if (campaigns.some((c) => c.code === campaign.code)) {
    throw new Error(`A campaign with code "${campaign.code}" already exists.`);
  }
  campaigns.unshift(campaign);
  writeCollection(COLLECTION, campaigns);
  return campaign;
}

export async function updateCampaign(code, patch) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').update(patch).eq('code', code).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const campaigns = readCollection(COLLECTION);
  const idx = campaigns.findIndex((c) => c.code === code);
  if (idx === -1) return null;
  campaigns[idx] = { ...campaigns[idx], ...patch };
  writeCollection(COLLECTION, campaigns);
  return campaigns[idx];
}

export async function deleteCampaign(code) {
  if (hasSupabase) {
    const { error } = await supabase.from('campaigns').delete().eq('code', code);
    if (error) throw error;
    return true;
  }
  const campaigns = readCollection(COLLECTION);
  const next = campaigns.filter((c) => c.code !== code);
  const removed = next.length !== campaigns.length;
  writeCollection(COLLECTION, next);
  return removed;
}

export async function getCampaignByCode(code) {
  if (!code) return null;
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').select('*').eq('code', code).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(COLLECTION).find((c) => c.code === code) || null;
}

// Increments usage_count and revenue_attributed on the campaign a checkout
// applied. Silently no-ops if the code doesn't exist or is exhausted, since
// this runs after payment succeeded and shouldn't fail the order.
export async function recordCampaignUsage(code, orderTotal) {
  const campaign = await getCampaignByCode(code);
  if (!campaign || !campaign.active) return null;
  if (campaign.usage_limit != null && campaign.usage_count >= campaign.usage_limit) return null;

  const patch = {
    usage_count: campaign.usage_count + 1,
    revenue_attributed: Number(campaign.revenue_attributed || 0) + orderTotal,
  };

  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').update(patch).eq('code', code).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const campaigns = readCollection(COLLECTION);
  const idx = campaigns.findIndex((c) => c.code === code);
  if (idx === -1) return null;
  campaigns[idx] = { ...campaigns[idx], ...patch };
  writeCollection(COLLECTION, campaigns);
  return campaigns[idx];
}
