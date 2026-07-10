# Comley Builder — Handoff (2026-07-03)

## TL;DR

- **Live site**: https://nexus.comleycreative.com — still on the pre-multi-tenant deploy from earlier tonight. **Untouched**, working, single-tenant. Do not redeploy from this branch until the client-side work below is done.
- **This branch (`feature/ops-console-port`)**: multi-tenant server-side is DONE. Multi-tenant client-side is NOT. If you deploy as-is, the CMS UI will 401/403 everywhere because the client doesn't send an org context yet.

## What actually shipped tonight before this refactor

Currently deployed on Vercel + Supabase, working end-to-end:

- Marketing landing at `/`, sign-in gate on `/:orgSlug/*`, redirect for stale `/shop`, `/cart`, etc.
- Full CMS + ops console at `/admin/*` (Ethan's org slug).
- Sentry (server), Clerk auth, Helmet + CSP + rate limits + HTML sanitization.
- 21 Supabase tables + 2 storage migrations applied.
- Storage layer talks to Supabase over PostgREST (works from Vercel serverless — do NOT try pg TCP).

## What's WIP on this branch (server-side complete, client-side untouched)

Migration `db/migrations/003_multi_tenant.sql` applied to production Supabase already:

- New `orgs` table (id text = URL slug, name, domain, plan, feature_flags jsonb).
- New `org_members` table ({org_id, user_email, role}).
- `org_id` column added to all 16 content tables + `global_settings` moved from singleton to per-org.
- Bootstrap seed: `orgs.id='admin'` + `org_members` row for `ethanfcomley@gmail.com`. All existing content backfilled to `org_id='admin'`.

Code updated to require `orgId` on every call:

- `lib/storage.js` — every helper now takes `orgId` as first arg. Also exports new `orgs`, `orgMembers`, and `orgForUser()` helpers.
- `lib/auth.js` — `resolveViewer` now also loads the user's org and sets `req.org = { id, slug, name, role, feature_flags }`. New exports: `requireOrgMatch`, `requireSuperAdmin`.
- `server.js` — every route uses `req.org.id`, gated by new `requireOrg` middleware. New endpoints: `GET /api/me`, `GET|POST|PATCH|DELETE /api/orgs`, `GET|POST|DELETE /api/orgs/:id/members`.
- `lib/ops/routes.js` — every ops route also uses `req.org.id`, gated by `requireOrg`.

Local build passes (`npm run build`) and server loads without errors. Not smoke-tested against live Supabase.

## What still needs doing (in order)

### 1. Client-side org context (blocking deploy)

The React SPA still assumes it's talking to a single-tenant API. Before deploying, wire the client to know its org:

- After sign-in, hit `GET /api/me` to get `{ viewer, org }`.
- Store `org` in a React context or hoist it as a query param.
- Add it as an `X-Org-Slug` header on every `fetch` in `src/cms/lib/api.js`. Server should verify `X-Org-Slug === req.org.slug` as belt-and-suspenders.
- OR: derive the org from the URL param `useParams().orgSlug` and pass it as a query param on every API call. Simpler if the server accepts either.

The current `req.org` is derived from Clerk metadata + `org_members` table lookup — it will just work as long as the user has an entry in `org_members` for the requested org. No client change strictly required for **Ethan's** account (his org is auto-derived), but changes are needed once you onboard a second client with a different slug.

### 2. Rebase hardcoded `/admin/*` links (~20 files)

Search for `to="/admin/` and `to={"/admin/` across `src/cms/pages/*` and `src/commerce/pages/*`. Replace with `to={`/${orgSlug}/…`}`. Use `useParams().orgSlug` or a new `useOrgBase()` hook. Ethan's org slug is literally `admin`, so his URLs stay identical — but a second client would break without this.

### 3. Settings restructure (user asked for this)

Requirements from the previous conversation:

- Settings landing page (`/:orgSlug/settings`) shows all sub-settings as clickable category cards — not just "General".
- Categories: **Workspace** (name, domain, timezone, branding), **Design** (theme, global content, styleguide), **Team** (members, roles, invites), **Integrations** (Google, Slack, AI providers, Stripe), **Content** (redirects, analytics), **Ops** (audit log, connections), **Billing** (placeholder).
- Every sub-page is also directly reachable from nav.

### 4. Org creation UI (super-admin only)

A page at `/:orgSlug/settings/orgs` for Ethan to onboard clients:

- List existing orgs (`GET /api/orgs`).
- "New workspace" form → `POST /api/orgs` (id, name, domain, plan, admin email).
- Invite pending members → `POST /api/orgs/:id/members`.
- Note: creating the DB row + `org_members` seat is done; but Clerk invite emails still need to be sent from the Clerk dashboard (or we hook up `clerkClient.invitations.createInvitation` server-side later).

### 5. Client onboarding UX

- First-run welcome cards on empty-org Dashboard: "Set your site name", "Add your first page", "Invite your team".
- **Custom domain onboarding**: Settings > Workspace > Custom domain input. When they enter one, show them the exact Cloudflare/DNS records to add and the Vercel domain to set (they configure Vercel; you don't have to).

### 6. Deploy + verify

Only after 1–5. Otherwise the CMS will 401 for signed-in users.

## Critical facts you shouldn't lose

- **Repo**: `ecomley45-droid/comley-nexus`, branch `feature/ops-console-port`. All this work is committed on the branch. Nothing pushed to remote yet from this session.
- **Data layer**: Supabase JS client only. `pg` in `package.json` is just for `db/apply.mjs` local schema application — do NOT try to use it from the runtime; Vercel serverless can't reach the Supabase pooler over TCP.
- **Sentry**: server-side wired. Frontend DSN never got set (`VITE_SENTRY_DSN` is empty). Ethan chose to reuse the backend DSN for the browser too — just paste it in Vercel env when ready.
- **Fly.io / Render / Railway**: user explicitly ruled these out for the backend. Stay on Vercel + Supabase JS.
- **`serverless-http` was removed** — it hangs on Vercel's request shape. `api/index.js` calls `app(req, res)` directly.
- **`assertProductionAuth()` in `lib/auth.js`**: prod crashes on start if `CLERK_SECRET_KEY` is missing. That's intentional.
- **Public dynamic page render** currently hardcodes `PUBLIC_ORG_ID = 'admin'` — so nexus.comleycreative.com's public pages are Ethan's org. When clients get their own custom domains, resolve `PUBLIC_ORG_ID` from the incoming `Host` header instead.

## The one thing that might bite you

`req.viewer` is set by Clerk middleware, then `req.org` is loaded async in `resolveViewer`. If any middleware runs synchronously before that promise resolves, it'll see `req.org = undefined`. Check the order of `app.use()` calls in `server.js` — `resolveViewer` must run before any `requireOrg`-guarded route. Currently correct, but be careful when adding new middleware.

## Related running things

- **claude.ai Gmail + Google Calendar MCP servers**: connecting but require OAuth in a claude.ai session. Not needed for this work.

## Files touched this session

Server-side (this is what's uncommitted right now):

- `db/migrations/003_multi_tenant.sql` (new)
- `db/apply.mjs` (added migration to list)
- `lib/storage.js` (full rewrite — every helper takes `orgId`)
- `lib/auth.js` (loads `req.org`, new `requireOrgMatch` + `requireSuperAdmin`)
- `server.js` (full rewrite — `requireOrg` on every route, new `/api/me` + `/api/orgs*`)
- `lib/ops/routes.js` (full rewrite — every handler passes `orgId`)

Nothing in `src/` (client) was touched this session — that's item #1 above.

---

## Social layer (added 2026-07-10)

A Sprout-style social feature: connect a workspace's accounts, read performance, and compose / publish / schedule to Instagram, Facebook, X, LinkedIn, TikTok. **Direct** platform integrations (no aggregator).

**Run it today:** set `SOCIAL_SANDBOX=1`. Every platform is faked by `lib/social/adapters/sandbox.js`, so the whole flow — connect, dashboard, compose, publish, schedule — works with only Supabase. Each platform flips to its real adapter automatically once its credentials (`.env.example`) are present; unconfigured platforms stay sandboxed. Gated per-workspace by `feature_flags.social` (or sandbox).

**Backend** (`lib/social/`):
- `platforms.js` — platform metadata + composer constraints.
- `adapters/` — one module per platform (`meta` serves ig+fb) + `sandbox`; `index.js` resolves live-vs-sandbox per platform. Contract: authUrl/exchangeCode/refresh/publish/fetchMetrics/fetchFeed.
- `accounts.js` `metrics.js` `posts.js` — repos. OAuth tokens encrypted via `lib/secretCrypto.js` (extracted from `apiKeys.js`; same AES-256-GCM vault), never sent to the client.
- `service.js` — OAuth orchestration, token refresh, metrics polling, publish fan-out (idempotent per target), dashboard aggregation.
- `scheduler.js` — QStash in prod, in-process timer fallback locally; `posts.listDue` + the publish-due cron are the durable backstop.
- `feed.js` — server-side Social Feed block: renders the placeholder to static HTML at serve time (CSP-safe, no embed scripts).
- `routes.js` — `mountSocialApi(app)`; org routes + secret-guarded `/api/social/cron/*`.
- `db/migrations/014_social.sql` — 4 tables + the Social Feed catalog entry.

**Frontend:** nav group in `CmsLayout` (gated); pages in `src/cms/pages/social/` (Dashboard, Compose, Calendar, Accounts); API methods appended to `src/cms/lib/api.js`; `social-feed` renderer in `blockRenderers.js`.

**Prod cron to wire (Vercel Cron → the secret-guarded endpoints):** `/api/social/cron/publish-due` (~1 min), `/api/social/cron/refresh-tokens` (daily), `/api/social/cron/poll-metrics` (hourly/daily).

**Not yet done (deliberate follow-ups):** Media-library picker in the composer (URLs for now); multi-Page/org-actor pickers for Meta/LinkedIn; X/LinkedIn media upload; per-post metric rows. None block the sandbox flow.

---

## Email builder (added 2026-07-10)

A Sailthru-style, block-based email builder: drag-style block editor, AI template generation + copywriting + brand restyle, a starter template gallery, and full campaigns (audience → schedule → send) with open/click tracking and per-recipient engagement.

**Availability:** a standard CMS feature labeled **Newsletter** in nav — every workspace, no feature flag, not tied to Commerce. Real sending only happens when Resend is configured; otherwise it sandboxes (logged, not delivered). `EMAIL_SANDBOX=1` forces the sandbox regardless — build → audience → send → stats works on just Supabase. Configure Resend + `PUBLIC_BASE_URL` (tracking) + `ANTHROPIC_API_KEY` (AI) for the full production experience.

**Render engine:** MJML v5 (async). `lib/email/render.js` maps the block document → MJML → Outlook-safe table HTML. `compile()` is the single source of truth for both live preview and send, so preview == inbox. MJML is server-only (never bundled into the client).

**Backend** (`lib/email/`): `blocks.js` (document model + defaults + in-code starter gallery), `render.js`, `templates.js`/`campaigns.js` (repos), `audience.js` (resolves from newsletter form_submissions + commerce customers), `ai.js` (generate/copy/restyle, reuses the aiSiteGen Claude pattern), `send.js` (compile → per-recipient tracking → Resend, with sandbox + open/click pixels + suppression), `routes.js` (`mountEmailApi`). Migration `015_email.sql`: email_templates, email_campaigns, email_events, email_suppressions.

**Frontend:** Email nav group in `CmsLayout` (gated); pages in `src/cms/pages/email/` — Templates (gallery + AI), Builder (block editor + live iframe preview), Campaigns list + detail (audience/send/stats). API methods appended to `src/cms/lib/api.js`.

**Prod cron:** `/api/email/cron/send-due` (~1 min) sends scheduled campaigns.

**Known caveats / deliberate follow-ups:**
- **Audience tenancy:** `form_submissions` is org-scoped (safe). The commerce `customers` table has no `org_id` (single-tenant), so "Commerce customers" is an explicit opt-in source — revisit if commerce becomes multi-tenant before relying on it per-workspace.
- Builder does add/edit/reorder/delete of blocks and 1–2 column rows; free-form drag-and-drop and deep column nesting are follow-ups.
- Timer block renders a static styled date (live countdown needs a countdown-image service). Video renders a clickable thumbnail (email can't embed video).
- "Edit design" for an existing campaign currently re-enters the builder; saving there creates a new campaign draft rather than updating in place.
