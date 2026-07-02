# Commerce module setup

The commerce module (`lib/commerce/`, `src/commerce/`) runs end-to-end with **zero API keys** using local
fallbacks: a JSON-file store instead of Supabase, an in-memory cart instead of Redis, keyword search instead
of Pinecone, console/file-logged email instead of Resend, console-logged events instead of PostHog, a
"simulate payment" button instead of Stripe, and an `X-User-Role` / `X-Customer-Id` header trust model
instead of Clerk. This lets you build and test the whole product → cart → checkout → order → email flow
before wiring up any real service, then flip each one on independently by adding its env vars.

## Quick start (no keys needed)

```bash
npm install
cp .env.example .env   # leave it empty — proves local-fallback mode works
npm run dev             # Vite (5173) + Express (PORT from .env, default 5050)
```

Port 5000 is claimed by macOS's AirPlay Receiver on many Macs, so the default `PORT` is `5050` — if you
change it, also update the proxy targets in `vite.config.js`.

Visit `http://localhost:5173/admin` to create a product and set a dev tier (customer/wholesaler/admin),
then `http://localhost:5173/shop` to browse, add to cart, and check out via the "Simulate payment" button.

## Turning each integration on

| Service | Env vars | What it unlocks | Where it's implemented |
|---|---|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Real Postgres storage for products/orders/customers/campaigns instead of `data/commerce/*.json`. Run `db/schema.sql` in the Supabase SQL editor first. | `lib/commerce/supabaseClient.js`, `*Repo.js` |
| Clerk | `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `VITE_CLERK_PUBLISHABLE_KEY` | Real auth + session-based role tiers instead of trusted headers. Point a Clerk webhook at `/api/webhooks/clerk` for `user.created`/`user.updated`, and set each user's tier via Clerk's `publicMetadata.tier`. | `lib/commerce/clerkAuth.js`, `src/main.jsx`, `src/commerce/lib/useCommerceUser.js` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` | Real embedded Stripe Checkout instead of the "Simulate payment" button. Point a Stripe webhook at `/api/webhooks/stripe` for `payment_intent.succeeded` and `charge.refunded`. | `lib/commerce/stripeClient.js`, `src/commerce/pages/CheckoutPage.jsx` |
| Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Real transactional email instead of files written to `data/commerce/emails/`. | `lib/commerce/resendClient.js` |
| PostHog | `POSTHOG_API_KEY`, `VITE_POSTHOG_API_KEY` | Real event capture (`product_viewed`, `added_to_cart`, `checkout_started`, `purchase_completed`) instead of console logs. | `lib/commerce/posthogClient.js`, `src/commerce/lib/posthogClient.js` |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Real shared cart cache (5 min TTL) instead of an in-process `Map`, needed once you run more than one server instance. | `lib/commerce/cart.js` |
| Pinecone + OpenAI | `PINECONE_API_KEY`, `PINECONE_INDEX`, `OPENAI_API_KEY` | Real semantic product search instead of substring matching. Products are embedded/indexed automatically on create/update/delete. | `lib/commerce/pineconeClient.js` |

## What's not built

- The original Nexus CMS drag-drop page editor UI is not rebuilt — `src/admin/AdminPlaceholder.jsx` is a
  minimal stand-in so the existing `/api/pages`, `/api/library`, `/api/media`, etc. routes in `server.js`
  have somewhere to be driven from. `src/shared/compilePage.js` was reconstructed from its usage contract
  in `server.js` and works, but wasn't the original file.
- Abandoned-cart email sequences (24h/72h) and B2B invoice emails are Tier 2 per the original request's
  stated priority — the `campaigns` table/repo and `orders.campaign_code` plumbing exist, but there's no
  scheduled job sending them yet.
- Vercel deployment config isn't included; the app currently assumes a single long-running Node process
  (Express + Vite), not serverless functions. Moving `lib/commerce/routes.js` handlers to Vercel functions
  would be the next step if deploying there.
