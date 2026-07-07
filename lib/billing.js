// Platform subscription billing: Nexus's own Starter/Pro/Agency plans,
// paid via Stripe Checkout subscriptions. Distinct from lib/commerce/*
// (which is client workspaces selling THEIR products) but reuses the same
// Stripe client + webhook endpoint.
//
// Products/prices are found by lookup_key (`nexus_<plan>_<interval>`) and
// created on demand if missing -- run `node scripts/setupStripePlans.mjs`
// once to pre-create them, or let the first checkout call do it lazily.

import { stripe } from './commerce/stripeClient.js';
import * as storage from './storage.js';

export const PLANS = {
  starter: { label: 'Starter', monthly: 1900, annual: 19000 },
  pro: { label: 'Pro', monthly: 4900, annual: 49000 },
  agency: { label: 'Agency', monthly: 14900, annual: 149000 },
};

const lookupKey = (plan, interval) => `nexus_${plan}_${interval}`;

function assertStripe() {
  if (!stripe) throw new Error('Billing is not configured on this deployment (STRIPE_SECRET_KEY missing).');
}

async function findOrCreatePrice(plan, interval) {
  assertStripe();
  const key = lookupKey(plan, interval);
  const existing = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
  if (existing.data[0]) return existing.data[0];

  // One product per plan, found by our metadata marker.
  const products = await stripe.products.search({ query: `metadata['nexus_plan']:'${plan}'` });
  const product = products.data[0] || await stripe.products.create({
    name: `Nexus ${PLANS[plan].label}`,
    metadata: { nexus_plan: plan },
  });

  return stripe.prices.create({
    product: product.id,
    unit_amount: PLANS[plan][interval === 'annual' ? 'annual' : 'monthly'],
    currency: 'usd',
    recurring: { interval: interval === 'annual' ? 'year' : 'month' },
    lookup_key: key,
    metadata: { nexus_plan: plan, nexus_interval: interval },
  });
}

export async function ensurePlans() {
  const created = [];
  for (const plan of Object.keys(PLANS)) {
    for (const interval of ['monthly', 'annual']) {
      const price = await findOrCreatePrice(plan, interval);
      created.push({ plan, interval, priceId: price.id, lookupKey: lookupKey(plan, interval) });
    }
  }
  return created;
}

export async function createCheckoutSession({ orgId, plan, interval, email, origin }) {
  if (!PLANS[plan]) throw new Error(`Unknown plan "${plan}"`);
  const price = await findOrCreatePrice(plan, interval === 'annual' ? 'annual' : 'monthly');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: price.id, quantity: 1 }],
    customer_email: email || undefined,
    // orgId rides on both the session AND the subscription itself, so
    // later subscription.updated/deleted events (which don't carry the
    // session) can still be mapped back to the workspace.
    metadata: { nexus_org_id: orgId, nexus_plan: plan },
    subscription_data: { metadata: { nexus_org_id: orgId, nexus_plan: plan } },
    success_url: `${origin}/${orgId}/settings/billing?checkout=success`,
    cancel_url: `${origin}/${orgId}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });
  return session;
}

export async function createPortalSession({ customerId, orgId, origin }) {
  assertStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/${orgId}/settings/billing`,
  });
}

// Applies a subscription state change to the org row. Called from the
// shared Stripe webhook for checkout.session.completed (initial purchase)
// and customer.subscription.updated/deleted (renewals, plan changes,
// cancellations).
async function applySubscription(orgId, { plan, status, customerId, subscriptionId, periodEnd }) {
  const org = await storage.orgs.get(orgId);
  if (!org) return;
  const active = status === 'active' || status === 'trialing';
  await storage.orgs.update(orgId, {
    plan: active && plan ? plan : org.plan,
    featureFlags: {
      ...(org.feature_flags || {}),
      subscription: {
        status,
        plan: plan || org.feature_flags?.subscription?.plan || null,
        stripe_customer_id: customerId || org.feature_flags?.subscription?.stripe_customer_id || null,
        stripe_subscription_id: subscriptionId || org.feature_flags?.subscription?.stripe_subscription_id || null,
        current_period_end: periodEnd || null,
      },
      // A paid subscription supersedes any trial countdown.
      ...(active ? { trial_ends_at: null } : {}),
    },
  });
  await storage.audit.append(orgId, 'Subscription updated', `${plan || 'plan'} — ${status}`);
}

export async function handleBillingEvent(event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode !== 'subscription' || !session.metadata?.nexus_org_id) return false;
    await applySubscription(session.metadata.nexus_org_id, {
      plan: session.metadata.nexus_plan,
      status: 'active',
      customerId: session.customer,
      subscriptionId: session.subscription,
    });
    return true;
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    if (!sub.metadata?.nexus_org_id) return false;
    await applySubscription(sub.metadata.nexus_org_id, {
      plan: sub.metadata.nexus_plan,
      status: event.type.endsWith('deleted') ? 'cancelled' : sub.status,
      customerId: sub.customer,
      subscriptionId: sub.id,
      periodEnd: sub.current_period_end ? sub.current_period_end * 1000 : null,
    });
    return true;
  }
  return false;
}
