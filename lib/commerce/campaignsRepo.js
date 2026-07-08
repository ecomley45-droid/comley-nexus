import { hasSupabase } from './env.js';
import { supabase } from './supabaseClient.js';
import { readCollection, writeCollection } from './localStore.js';

// Org-scoped. Campaign `code` is unique per workspace (not globally), so every
// lookup/mutation takes an orgId.
const col = (orgId) => `campaigns__${orgId || 'default'}`;

export async function listCampaigns(orgId) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId));
}

export async function createCampaign(orgId, input) {
  const campaign = {
    org_id: orgId,
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
  const campaigns = readCollection(col(orgId));
  if (campaigns.some((c) => c.code === campaign.code)) {
    throw new Error(`A campaign with code "${campaign.code}" already exists.`);
  }
  campaigns.unshift(campaign);
  writeCollection(col(orgId), campaigns);
  return campaign;
}

export async function updateCampaign(orgId, code, patch) {
  const { org_id, code: _c, ...safe } = patch;
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').update(safe).eq('org_id', orgId).eq('code', code).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const campaigns = readCollection(col(orgId));
  const idx = campaigns.findIndex((c) => c.code === code);
  if (idx === -1) return null;
  campaigns[idx] = { ...campaigns[idx], ...safe };
  writeCollection(col(orgId), campaigns);
  return campaigns[idx];
}

export async function deleteCampaign(orgId, code) {
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').delete().eq('org_id', orgId).eq('code', code).select('code');
    if (error) throw error;
    return (data || []).length > 0;
  }
  const campaigns = readCollection(col(orgId));
  const next = campaigns.filter((c) => c.code !== code);
  const removed = next.length !== campaigns.length;
  writeCollection(col(orgId), next);
  return removed;
}

export async function getCampaignByCode(orgId, code) {
  if (!code) return null;
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').select('*').eq('org_id', orgId).eq('code', code).maybeSingle();
    if (error) throw error;
    return data;
  }
  return readCollection(col(orgId)).find((c) => c.code === code) || null;
}

// Increments usage/revenue after a paid checkout. No-ops on missing/exhausted.
export async function recordCampaignUsage(orgId, code, orderTotal) {
  const campaign = await getCampaignByCode(orgId, code);
  if (!campaign || !campaign.active) return null;
  if (campaign.usage_limit != null && campaign.usage_count >= campaign.usage_limit) return null;
  const patch = {
    usage_count: campaign.usage_count + 1,
    revenue_attributed: Number(campaign.revenue_attributed || 0) + orderTotal,
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from('campaigns').update(patch).eq('org_id', orgId).eq('code', code).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const campaigns = readCollection(col(orgId));
  const idx = campaigns.findIndex((c) => c.code === code);
  if (idx === -1) return null;
  campaigns[idx] = { ...campaigns[idx], ...patch };
  writeCollection(col(orgId), campaigns);
  return campaigns[idx];
}
