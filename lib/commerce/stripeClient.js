import Stripe from 'stripe';
import { env, hasStripe } from './env.js';

export const stripe = hasStripe ? new Stripe(env.stripeSecretKey) : null;

// Embedded Checkout Session per the spec's "Checkout -> Stripe embedded form".
// Returns { clientSecret } for @stripe/react-stripe-js's EmbeddedCheckout.
export async function createCheckoutSession({ items, successUrl, metadata }) {
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'payment',
    line_items: items.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    })),
    metadata,
    return_url: successUrl,
  });
  return { clientSecret: session.client_secret, sessionId: session.id };
}

export function verifyWebhookSignature(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}
