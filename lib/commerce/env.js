import 'dotenv/config';

// Central place to read commerce env vars and know which integrations are
// "live" vs. falling back to local dev implementations. Every client module
// in lib/commerce/ checks these flags instead of re-deriving them.
export const env = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET || '',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',

  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || 'orders@example.com',

  posthogApiKey: process.env.POSTHOG_API_KEY || '',
  posthogHost: process.env.POSTHOG_HOST || 'https://app.posthog.com',

  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',

  pineconeApiKey: process.env.PINECONE_API_KEY || '',
  pineconeIndex: process.env.PINECONE_INDEX || 'comley-products',

  openaiApiKey: process.env.OPENAI_API_KEY || '',
};

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
export const hasClerk = Boolean(env.clerkSecretKey);
export const hasStripe = Boolean(env.stripeSecretKey);
export const hasResend = Boolean(env.resendApiKey);
export const hasPosthog = Boolean(env.posthogApiKey);
export const hasUpstash = Boolean(env.upstashRedisUrl && env.upstashRedisToken);
export const hasPinecone = Boolean(env.pineconeApiKey);
export const hasOpenAI = Boolean(env.openaiApiKey);
