# Nexus CMS — Claude Project Instructions

You are assisting with **Nexus CMS** (repo: `comley-nexus`, operated by Comley Creative). Use this document as the source of truth for what the product is, how the codebase is organized, and the conventions to follow when writing or changing code.

---

## 1. What Nexus CMS is

Nexus is a **multi-tenant, white-label website builder and small-business platform**. Comley Creative runs one deployment that hosts many client **workspaces** (internally "orgs"). Each workspace is a self-contained CMS: its own pages, media, forms, theme, domain, team, and optional modules (commerce, social, email). On top of the workspaces sits a **Super Admin** surface where Comley operates the platform itself and edits Nexus's *own* marketing site.

Think of it as: **Wix/Webflow-style site builder + Shopify-style commerce + Sprout-style social + Sailthru-style email + an ops console**, unified under one multi-tenant app.

There are effectively **two kinds of "site"** in the system:
- **The CMS console** — the React admin app where users build and manage their workspace (`/:orgSlug/*`) and where Comley administers everything (`/super-admin/*`).
- **The published public sites** — the live websites visitors see, rendered to static-ish HTML on the server from the block documents. A workspace's public site is served on the platform host or the workspace's own custom domain.

---

## 2. How the code is handled (architecture & conventions)

### Stack
- **Frontend:** React 19 + Vite SPA, React Router (lazy-loaded route chunks), Tailwind CSS v4, `lucide-react` icons, a custom glassmorphism UI kit (`src/cms/lib/ui/Glass.jsx`, `AppShell.jsx`). Sentry (browser) + PostHog for analytics.
- **Backend:** a single Express app in **`server.js`** plus modular routers under **`lib/*`**. It runs on Vercel as **one serverless function** via `api/index.js`, which calls `app(req, res)` directly (note: `serverless-http` was removed because it hangs on Vercel's request shape). Security middleware: Helmet + CSP, `express-rate-limit`, `cookie-parser`, `sanitize-html`.
- **Auth:** **Clerk** (`@clerk/express` server, `@clerk/clerk-react` client). Role hierarchy `viewer(0) < editor(1) < admin(2)` (`ROLE_RANK` in `lib/auth.js`). Platform **super-admins** are defined by the `ADMIN_EMAILS` env var, independent of any workspace membership.
- **Data:** **Supabase**. Postgres is accessed through the **Supabase JS client over PostgREST** — **never raw `pg` from the runtime** (Vercel serverless can't reach the Supabase pooler over TCP). `pg` exists only for `db/apply.mjs`, the local migration runner. Media bytes live in a public Supabase **Storage** bucket (`media`), one folder per workspace plus a `nexus/` folder for the platform's own media.
- **Other infra:** Stripe (platform billing + commerce payments), Resend (email delivery), MJML (email HTML render, server-only), `sharp` (image → WebP on upload), Upstash Redis / QStash (schedulers & cron in prod, in-process timer fallback locally), OpenAI/Anthropic + Pinecone (AI features), `svix` (webhooks), `modern-screenshot`.

### Request & tenancy model
- `lib/auth.js` `resolveViewer` middleware runs first and sets **`req.viewer`** (the Clerk user) and **`req.org`** = `{ id, slug, name, role, feature_flags, domain, paused }` by looking up `org_members`. **This must run before any `requireOrg`-guarded route.**
- Guards: **`requireOrg`** (must belong to the active workspace), **`requireRole(min)`** (write gating), **`requireSuperAdmin`** (`ADMIN_EMAILS`).
- **Multi-tenancy:** every content table has an `org_id` column; `global_settings` is per-org. **`lib/storage.js`** is the workspace data layer — every helper takes `orgId` as its first argument, asserts it, and maps snake_case DB columns → camelCase app objects.
- **The platform's own site ("Nexus")** lives in standalone **`nexus_*` tables** (no `org_id`, no FK to orgs) via **`lib/nexus.js`**, gated purely by `requireSuperAdmin`. It mirrors the storage layer but takes no `orgId`.
- Super Admin can **"view as"** a workspace (impersonate) to administer it.

### Pages & blocks
- A page's content is an **array of block objects** (`content: [...]`). **HTML is never stored** — it's derived client-side from each block's fields by **`src/cms/lib/pasteIn/blockRenderers.js`**, so changing a renderer updates every existing page without a data migration.
- **`src/shared/compilePage.js`** is shared by client and server: it compiles a page (blocks + theme + global header/footer/settings) into the full public HTML document — used for both **live preview** and **server-side serving**. It also emits SEO/meta (`<title>`, canonical, OG/Twitter, favicon).
- The **"Add Block" catalog** lives in `nexus_block_catalog`: rows with `org_id = null` are the platform-wide catalog (Super-Admin-editable); rows with a real `org_id` are that workspace's custom blocks.
- **A/B testing:** a section can hold weighted variants; `pickWeightedVariant` chooses one at serve time and impressions are recorded in `ab_stats`.

### Sandboxes & feature flags
- External-dependency features run **end-to-end on just Supabase** via env sandboxes: `SOCIAL_SANDBOX=1`, `EMAIL_SANDBOX=1`. Each integration flips to its real adapter automatically once its credentials are present.
- Per-workspace capabilities are gated by `feature_flags` (e.g. `social`, `commerce`) on the org row.

### Security
- All stored HTML/content passes through **`lib/sanitize.js`** (`sanitize-html`). Secrets (OAuth tokens, integration API keys) are encrypted at rest with an **AES-256-GCM vault** (`lib/secretCrypto.js`) and never sent to the client. Draft pages are viewable only via signed **preview tokens**. Helmet CSP is tuned per surface.

### Deployment & data ops
- **GitHub → Vercel → Supabase.** Push to **`main`** auto-deploys to production (`nexus.comleycreative.com`). `vite build` outputs `dist/`; the server is the `api/index.js` function (`maxDuration` 30s). `vercel.json` routes `/api/*` to the function, serves published pages through it, and falls back to the SPA shell for app routes.
- **Migrations:** add a `db/migrations/NNN_*.sql` file (idempotent — `create table if not exists`, etc.) and register it in `db/apply.mjs`. Against a **fresh** DB run `node db/apply.mjs` (needs `SUPABASE_DB_URL`, connect via the **session pooler**, not the IPv6-only direct host). Against the **already-migrated production** DB, apply the single new file only — the full script re-runs the base schema and will conflict.
- **Conventions:** work on a branch; pushing to `main` deploys. Commit messages end with a `Co-Authored-By:` trailer. Keep new code stylistically consistent with the file around it (the codebase favors dense, well-commented modules).

### Directory map
```
server.js                     Express app: all HTTP routes, middleware, public page render
api/index.js                  Vercel entry — calls app(req,res)
vercel.json                   Routing, function config
db/                           schema*.sql, migrations/*.sql, apply.mjs (runner)
lib/
  storage.js                  Per-workspace data layer (orgId-first)
  nexus.js                    Platform's own site data (nexus_* tables)
  auth.js                     Clerk viewer + org resolution, role guards
  sanitize.js secretCrypto.js Security
  blockCatalog.js             "Add Block" catalog
  ai.js aiSiteGen.js openai.js AI site generation
  billing.js                  Platform plans (Stripe)
  eventsStore.js ical.js      Events/calendars
  social/                     Social module (adapters, service, scheduler, feed, routes)
  email/                      Email module (blocks, render/MJML, campaigns, send, ai, routes)
  commerce/                   Commerce module (products, orders, inventory, cart, Stripe…)
  ops/                        Ops console routes
src/
  App.jsx                     Route table (super-admin, /:orgSlug, /:orgSlug/commerce)
  shared/compilePage.js       Page → HTML compiler (client + server)
  cms/lib/                    CmsLayout, SuperAdminLayout, AppShell, api.js, Glass UI, favicon.js
  cms/pages/                  All console pages (see feature list)
  commerce/                   Commerce console app
```

---

## 3. Full feature list

### CMS core
- **Pages** — hierarchical tree (parent/child), slugs, draft/published, **scheduled publishing**, **version history + restore**, per-page **SEO** (title, description, OG image), custom analytics head/body snippets, **A/B variant sections**, live preview via signed tokens.
- **Block editor** — 30+ block types rendered from field data, including: hero (centered / split), feature rows & icon grids, pricing tables & cards, price lists, stat/metric bands, testimonial grids & marquees, team grids, FAQ accordion, contact split, galleries (masonry), CTA bands & splits, blog cards, banner images, **video backgrounds / parallax / video split**, logo clouds & marquees, scrolling/flyer sliders, card grids, two-column & layout blocks, **product blocks**, **events list**, **social feed**, and raw **script/embed** blocks.
- **"Add Block" catalog** — platform-wide blocks plus per-workspace custom blocks.
- **Design & theme** — theme settings, global header/footer content, custom CSS, styleguide, **favicon** and **default OG image** (applied to public pages *and* the console tab icon).
- **Media library** — upload up to **10 MB**, automatic **WebP** conversion for raster images, alt-text/description metadata; available per-workspace and in Super Admin (Nexus's own media).
- **Content Library** — reusable HTML snippets/content.
- **Templates** — install pre-built site templates (with theme) from a **marketplace**; Super-Admin **template authoring/manager**, save-a-site-as-template, template import, and install tracking.
- **Redirects** — 301/302 path redirects.
- **Forms** — form blocks with submission capture and storage.
- **Comments** — per-page comments.
- **Feedback** — in-app feedback widget + review surface.
- **SEO & publishing** — `sitemap.xml`, `robots.txt`, canonical URLs, OG/Twitter meta, favicons, built-in page-view analytics (+ PostHog).
- **Custom domains** — map a workspace to its own hostname; the public site resolves by `Host` header.

### Events
- Calendars and events with **recurrence**, an **events-list** block, ICS/iCal feed, and hydration of live event data into pages.

### Social (Sprout-style)
- Connect a workspace's accounts to **Instagram, Facebook, X, LinkedIn, TikTok** via direct OAuth; performance **dashboard**; **compose / publish / schedule**; content **calendar**; server-rendered **social-feed** block. Encrypted tokens, idempotent publish fan-out, cron for publish-due / token-refresh / metric-polling. Full **sandbox mode**.

### Email / Newsletter (Sailthru-style)
- **Block-based email builder** with MJML rendering (preview == inbox), **AI** generation / copywriting / brand-restyle, a starter **template gallery**, and full **campaigns** (audience → schedule → send) with **open/click tracking**, suppression list, and engagement stats. Delivery via Resend; full **sandbox mode**. Labeled **Newsletter**, available to every workspace.

### Commerce (Shopify-style, per-workspace opt-in)
- **Products, Orders, Inventory, Locations** (multi-location retail), **Customers, Discounts, Growth, Content, Markets, Finance, Analytics**, plus cart and **Stripe** checkout, staff, and search/analytics integrations (Pinecone, PostHog).

### Ops console
- **Dashboard, System Status** (per-system status page), **Feature Requests, Schedule, Git-Pull, Profile, Audit Log**, and **Integrations/Connections** (Google, Slack, AI providers, Stripe, API-key vault).

### Team, billing & platform admin
- **Team & Permissions** — members, roles (viewer/editor/admin), invites.
- **Billing** — Stripe-based platform plans and per-workspace billing.
- **Super Admin (Nexus platform operator; `ADMIN_EMAILS`)** — manage all client workspaces (create / edit / pause), **view-as** a workspace, edit **Nexus's own site** (pages, media, settings), the **platform block catalog**, **template management**, **platform billing/plans**, and **Nexus settings** (identity, favicon, default OG image).

### AI
- **AI site generation** (`aiSiteGen`) and email AI, backed by OpenAI/Anthropic + Pinecone.

### Onboarding
- Marketing **landing page**, sign-up/**welcome** flow, first-run **welcome cards** for empty workspaces, and self-serve workspace creation.

---

## 4. Working agreements for Claude
- Prefer editing the existing storage/render layers over inventing parallel ones; **`lib/storage.js`** (workspace) and **`lib/nexus.js`** (platform) are the two data spines.
- Respect tenancy: workspace code takes `orgId`; platform code is `requireSuperAdmin` + `nexus_*`.
- Never store rendered HTML for blocks — extend `blockRenderers.js` / `compilePage.js` instead.
- Keep everything **sandbox-friendly**: a new integration should degrade gracefully without its credentials.
- Data changes = a new idempotent migration file **and** a `db/apply.mjs` registration; apply only the new file to the live DB.
- All stored user HTML/content must go through `lib/sanitize.js`; secrets go through `lib/secretCrypto.js`.
