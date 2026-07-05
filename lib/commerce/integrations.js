import { Redis } from '@upstash/redis';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { Resend } from 'resend';
import { PostHog } from 'posthog-node';
import {
  env, hasSupabase, hasClerk, hasStripe, hasResend, hasPosthog, hasUpstash, hasPinecone, hasOpenAI,
} from './env.js';
import { supabase } from './supabaseClient.js';
import { stripe } from './stripeClient.js';

export function integrationStatus() {
  return {
    supabase: hasSupabase,
    clerk: hasClerk,
    stripe: hasStripe,
    resend: hasResend,
    posthog: hasPosthog,
    upstash: hasUpstash,
    pinecone: hasPinecone,
    openai: hasOpenAI,
  };
}

// One lightweight, side-effect-safe live call per service to confirm the
// configured credentials actually work, not just that a key is present.
// Each entry returns { ok, message } and never throws — callers only need
// to check `configured` (from integrationStatus) before calling this.
//
// Messages returned to the client are deliberately generic (no table
// names, API hosts, index names, or raw error text) -- this page is
// client-facing, and implementation detail beyond "connected or not"
// is a support conversation, not UI copy.
const GENERIC_FAILURE = 'Connection test failed. Contact support if this persists.';

const TESTS = {
  async supabase() {
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) throw error;
    return 'Connected.';
  },
  async clerk() {
    const res = await fetch('https://api.clerk.com/v1/users?limit=1', {
      headers: { Authorization: `Bearer ${env.clerkSecretKey}` },
    });
    if (!res.ok) throw new Error('Clerk API rejected the request');
    return 'Connected.';
  },
  async stripe() {
    await stripe.balance.retrieve();
    return 'Connected.';
  },
  async resend() {
    const client = new Resend(env.resendApiKey);
    const { error } = await client.domains.list();
    if (error) throw new Error(error.message || 'Resend API error');
    return 'Connected.';
  },
  async posthog() {
    const client = new PostHog(env.posthogApiKey, { host: env.posthogHost });
    client.capture({ distinctId: 'connection-test', event: 'connection_test' });
    await client.shutdown();
    return 'Connected.';
  },
  async upstash() {
    const redis = new Redis({ url: env.upstashRedisUrl, token: env.upstashRedisToken });
    const key = 'connection-test';
    await redis.set(key, 'ok', { ex: 10 });
    const value = await redis.get(key);
    if (value !== 'ok') throw new Error('Round-trip set/get did not match');
    return 'Connected.';
  },
  async pinecone() {
    const pinecone = new Pinecone({ apiKey: env.pineconeApiKey });
    await pinecone.index(env.pineconeIndex).describeIndexStats();
    return 'Connected.';
  },
  async openai() {
    const client = new OpenAI({ apiKey: env.openaiApiKey });
    await client.models.list();
    return 'Connected.';
  },
};

export async function testIntegration(service) {
  const status = integrationStatus();
  if (!(service in TESTS)) return { ok: false, message: 'Unknown service.' };
  if (!status[service]) return { ok: false, message: 'Not connected yet — contact support to enable this.' };
  try {
    const message = await TESTS[service]();
    return { ok: true, message };
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }
}
