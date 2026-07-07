-- Seeds three pages into Nexus's own site (nexus_pages):
--   /terms      -- Terms of Service (blocks mode, inherits theme/header/footer)
--   /privacy    -- Privacy Policy (blocks mode)
--   /why-nexus  -- interactive plans/comparison page (Full HTML mode; its
--                  document rides inside layout jsonb -- see the
--                  editorMode/fullHtml stowaway in lib/nexus.js)
--
-- The /why-nexus page is a corrected rebuild of a drafted concept page:
-- claims about headless GraphQL APIs, Git sync, SSO/SLA, and $49/$129/$249
-- pricing didn't match the real product and were replaced with the actual
-- plans ($19/$49/$149, annual = 2 months free) and real features. External
-- Tailwind/Google-Fonts CDNs were removed (the public site's CSP blocks
-- them) and inline event handlers were converted to addEventListener (the
-- sanitizer strips on* attributes).
--
-- Safe to re-run: ON CONFLICT DO NOTHING (never clobbers later edits).

insert into nexus_pages (id, name, slug, parent_id, content, seo, status, analytics, layout)
values (
  'page-terms', 'Terms of Service', 'terms', null,
  jsonb_build_array(jsonb_build_object(
    'id', 'sec-terms-1',
    'name', 'Terms of Service',
    'html', $tos$<style>
.legal { max-width: 720px; margin: 0 auto; padding: 48px 24px; line-height: 1.7; }
.legal h1 { font-size: var(--text-h1); margin-bottom: 4px; }
.legal .updated { color: var(--color-muted); font-size: var(--text-small); margin-bottom: 32px; }
.legal h2 { font-size: var(--text-h3); margin: 32px 0 8px; }
.legal p, .legal li { color: var(--color-text); font-size: var(--text-body); }
.legal ul { padding-left: 22px; }
.legal a { color: var(--color-link); }
</style>
<div class="legal">
<h1>Terms of Service</h1>
<p class="updated">Last updated: July 7, 2026</p>

<p>These Terms of Service ("Terms") govern your use of Nexus, a website building and content management platform ("the Service") operated by Comley Creative ("we," "us"). By creating an account or using the Service, you agree to these Terms.</p>

<h2>1. Your account</h2>
<p>You need an account to use the Service. You're responsible for keeping your sign-in credentials secure and for all activity under your account. You must provide accurate information and be at least 18 years old (or the age of majority where you live) to open an account.</p>

<h2>2. Your content</h2>
<p>You own the content you create, upload, or import into the Service — pages, text, images, and files. By using the Service, you grant us the limited rights needed to store, process, back up, and publicly serve that content on your behalf (that's what a website host does). We claim no other ownership of your content.</p>
<p>You're responsible for your content. Don't publish anything you don't have the rights to, and don't use the Service to host content that is illegal, infringing, deceptive, or harmful — including malware, phishing pages, or content that exploits minors. We may remove content or suspend accounts that violate this section.</p>

<h2>3. Acceptable use</h2>
<ul>
<li>Don't attempt to breach, probe, or overload the Service or other users' workspaces.</li>
<li>Don't use custom code features (Script blocks, Full HTML mode) to attack visitors, harvest data deceptively, or circumvent the Service's security controls.</li>
<li>Don't resell the Service itself except through features we provide for that purpose (e.g. agency workspaces).</li>
<li>Don't use the Service to send spam or operate unlawful commerce.</li>
</ul>

<h2>4. Plans, billing, and trials</h2>
<p>Paid plans are billed through Stripe, monthly or annually, and renew automatically until cancelled. You can change or cancel your plan anytime from your workspace's Billing page; cancellation takes effect at the end of the current billing period, and we don't provide prorated refunds for partial periods except where required by law. New workspaces include a 14-day free trial; when a trial ends without a subscription, we may limit or suspend the workspace after notice.</p>

<h2>5. E-commerce features</h2>
<p>If you sell products through the Service, you are the merchant of record for your sales. You're responsible for your products, pricing, taxes, refunds, and compliance with consumer protection laws. Payments are processed by Stripe under their terms; we never store card numbers.</p>

<h2>6. AI features</h2>
<p>Some features use third-party AI models (e.g. Anthropic's Claude) to generate or classify content. AI output can be inaccurate — review anything AI produces before publishing it. Content you submit to AI features is processed by the model provider to provide the feature, not to train their models per their API terms.</p>

<h2>7. Availability and backups</h2>
<p>We work to keep the Service fast and available but don't guarantee uninterrupted service. We maintain backups of platform data; you can also export your workspace data. You're encouraged to keep your own copies of critical content.</p>

<h2>8. Termination</h2>
<p>You can delete your workspace at any time. We may suspend or terminate accounts that violate these Terms, create risk for us or other users, or go unpaid after notice. On termination we'll make reasonable efforts to let you export your content for 30 days unless the law or the violation prevents it.</p>

<h2>9. Disclaimers and limitation of liability</h2>
<p>The Service is provided "as is" without warranties of any kind, express or implied. To the maximum extent permitted by law, our total liability for any claim related to the Service is limited to the amount you paid us in the 12 months before the claim arose. We are not liable for indirect, incidental, or consequential damages, including lost profits or lost data.</p>

<h2>10. Changes to these Terms</h2>
<p>We may update these Terms as the Service evolves. For material changes we'll give notice (e.g. by email or in the dashboard) before they take effect. Continuing to use the Service after changes take effect means you accept them.</p>

<h2>11. Contact</h2>
<p>Questions about these Terms: <a href="mailto:hello@comleycreative.com">hello@comleycreative.com</a>.</p>
</div>$tos$
  )),
  '{"title": "Terms of Service — Nexus", "description": "The terms that govern your use of Nexus.", "ogImage": ""}'::jsonb,
  'published',
  '{"headSnippet": "", "bodySnippet": ""}'::jsonb,
  '{"useGlobalHeader": true, "useGlobalFooter": true, "headerOverride": "", "footerOverride": ""}'::jsonb
)
on conflict (id) do nothing;

insert into nexus_pages (id, name, slug, parent_id, content, seo, status, analytics, layout)
values (
  'page-privacy', 'Privacy Policy', 'privacy', null,
  jsonb_build_array(jsonb_build_object(
    'id', 'sec-privacy-1',
    'name', 'Privacy Policy',
    'html', $pp$<style>
.legal { max-width: 720px; margin: 0 auto; padding: 48px 24px; line-height: 1.7; }
.legal h1 { font-size: var(--text-h1); margin-bottom: 4px; }
.legal .updated { color: var(--color-muted); font-size: var(--text-small); margin-bottom: 32px; }
.legal h2 { font-size: var(--text-h3); margin: 32px 0 8px; }
.legal p, .legal li { color: var(--color-text); font-size: var(--text-body); }
.legal ul { padding-left: 22px; }
.legal a { color: var(--color-link); }
</style>
<div class="legal">
<h1>Privacy Policy</h1>
<p class="updated">Last updated: July 7, 2026</p>

<p>This policy explains what Comley Creative ("we," "us") collects when you use Nexus ("the Service") and what we do with it. The short version: we collect what's needed to run a website platform, we don't sell your data, and the analytics we give you about your sites are cookieless and don't identify your visitors.</p>

<h2>1. What we collect from account holders</h2>
<ul>
<li><strong>Account information</strong> — name, email, and profile details, managed through our sign-in provider (Clerk).</li>
<li><strong>Workspace content</strong> — the pages, media, forms, and settings you create, stored so we can host and serve your sites (Supabase, Vercel).</li>
<li><strong>Billing information</strong> — handled by Stripe. We store your subscription status and plan; we never see or store card numbers.</li>
<li><strong>Usage and logs</strong> — standard technical logs (requests, errors) used to keep the Service secure and working.</li>
<li><strong>API keys you connect</strong> — if you connect your own AI provider keys, they're encrypted at rest and used only to make the requests you initiate.</li>
</ul>

<h2>2. What we collect about your sites' visitors</h2>
<p>Published sites include our built-in analytics, which counts page views per page per day. It uses no cookies, no fingerprinting, and no visitor identifiers — we can tell you a page got 40 views yesterday, not who viewed it. If you add your own analytics snippets (e.g. Google Analytics) to your site, that's your integration and your responsibility to disclose to your visitors.</p>
<p>If your site collects form submissions, those submissions (e.g. a visitor's name, email, and message) are stored in your workspace's Forms inbox for you. You're the controller of that data; we process it on your behalf.</p>

<h2>3. What we do with it</h2>
<ul>
<li>Provide, secure, and improve the Service.</li>
<li>Send transactional email (form notifications, billing receipts, invitations) via Resend.</li>
<li>Process AI feature requests through the model provider (e.g. Anthropic) — only the content you submit to the feature, only to provide the feature.</li>
<li>Comply with legal obligations.</li>
</ul>
<p>We do not sell personal information, and we don't use your content or your visitors' data for advertising.</p>

<h2>4. Who we share it with</h2>
<p>Only the service providers needed to run the platform: Clerk (authentication), Stripe (payments), Supabase (database and storage), Vercel (hosting and CDN), Resend (email), and Anthropic (AI features). Each processes data only to provide their service to us. We may disclose information if required by law.</p>

<h2>5. Retention and deletion</h2>
<p>Workspace content is kept while your workspace is active. If you delete your workspace or account, we delete the associated content within a reasonable period, except minimal records we're legally required to keep (e.g. billing records). You can export your workspace data at any time.</p>

<h2>6. Security</h2>
<p>Data is encrypted in transit (TLS) and at rest at our providers; connected API keys get an additional layer of application-level encryption. No system is perfectly secure — if we learn of a breach affecting your data, we'll notify you promptly.</p>

<h2>7. Your rights</h2>
<p>Depending on where you live (e.g. EU/UK GDPR, California CPRA), you may have rights to access, correct, export, or delete your personal information. Email us and we'll honor them: <a href="mailto:hello@comleycreative.com">hello@comleycreative.com</a>.</p>

<h2>8. Children</h2>
<p>The Service isn't directed at children under 13 (or under 16 in the EU) and we don't knowingly collect their data.</p>

<h2>9. Changes</h2>
<p>We'll post updates here and note the date above; for material changes we'll notify account holders before they take effect.</p>
</div>$pp$
  )),
  '{"title": "Privacy Policy — Nexus", "description": "What Nexus collects, what it does with it, and the cookieless analytics your sites get.", "ogImage": ""}'::jsonb,
  'published',
  '{"headSnippet": "", "bodySnippet": ""}'::jsonb,
  '{"useGlobalHeader": true, "useGlobalFooter": true, "headerOverride": "", "footerOverride": ""}'::jsonb
)
on conflict (id) do nothing;

insert into nexus_pages (id, name, slug, parent_id, content, seo, status, analytics, layout)
values (
  'page-why-nexus', 'Why Nexus', 'why-nexus', null,
  '[]'::jsonb,
  '{"title": "Why Nexus — plans and comparison", "description": "One flat plan replaces a stack of plugins: visual blocks, AI site generation, A/B testing, forms, and analytics built in.", "ogImage": ""}'::jsonb,
  'published',
  '{"headSnippet": "", "bodySnippet": ""}'::jsonb,
  jsonb_build_object(
    'useGlobalHeader', false, 'useGlobalFooter', false, 'headerOverride', '', 'footerOverride', '',
    'editorMode', 'full-html',
    'fullHtml', $wn$<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Why Nexus — plans and comparison</title>
<meta name="description" content="One flat plan replaces a stack of plugins: visual blocks, AI site generation, A/B testing, forms, and analytics built in.">
<style>
:root { --indigo:#6366f1; --fuchsia:#d946ef; --bg:#070a13; --card:#0d1220; --border:rgba(255,255,255,0.1); --text:#e2e8f0; --muted:#a1a1aa; --accent:#a5b4fc; --good:#34d399; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,'Segoe UI',sans-serif; line-height:1.6; }
a { color:var(--accent); }
.wrap { max-width:1080px; margin:0 auto; padding:0 24px; }
nav { position:sticky; top:0; z-index:50; border-bottom:1px solid var(--border); background:rgba(7,10,19,0.85); backdrop-filter:blur(10px); }
nav .wrap { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; }
.logo { display:flex; align-items:center; gap:10px; font-weight:700; font-size:18px; color:var(--text); text-decoration:none; }
.logo .mark { width:30px; height:30px; border-radius:8px; background:linear-gradient(135deg,var(--indigo),var(--fuchsia)); display:grid; place-items:center; color:#fff; font-size:15px; }
.nav-cta { padding:8px 16px; border-radius:10px; background:#fff; color:#000; font-size:13px; font-weight:600; text-decoration:none; }
header.hero { text-align:center; padding:72px 24px 48px; }
.kicker { display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--accent); border:1px solid var(--border); background:rgba(255,255,255,0.04); padding:5px 14px; border-radius:999px; margin-bottom:18px; }
h1 { font-size:clamp(30px,5vw,48px); line-height:1.15; margin:0 0 16px; letter-spacing:-0.02em; }
.grad { background:linear-gradient(90deg,var(--accent),#f472b6); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sub { color:var(--muted); max-width:640px; margin:0 auto; font-size:17px; }
.toggle-row { display:flex; justify-content:center; margin:36px 0 8px; }
.seg { display:flex; gap:4px; padding:5px; border:1px solid var(--border); border-radius:14px; background:rgba(255,255,255,0.04); }
.seg button { border:0; background:transparent; color:var(--muted); font:inherit; font-size:13px; font-weight:600; padding:10px 22px; border-radius:10px; cursor:pointer; }
.seg button.on { background:linear-gradient(90deg,var(--indigo),var(--fuchsia)); color:#fff; }
section { padding:48px 0; }
h2 { font-size:28px; letter-spacing:-0.01em; margin:0 0 8px; text-align:center; }
.section-sub { color:var(--muted); text-align:center; max-width:560px; margin:0 auto 36px; font-size:15px; }
.bill-row { display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:32px; font-size:14px; }
.bill-row .save { font-size:11px; padding:2px 9px; border-radius:999px; background:rgba(52,211,153,0.12); color:var(--good); border:1px solid rgba(52,211,153,0.25); }
.switch { width:46px; height:24px; border-radius:999px; background:rgba(255,255,255,0.1); border:1px solid var(--border); cursor:pointer; position:relative; padding:0; }
.switch .dot { position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:var(--indigo); transition:transform 0.2s; }
.switch.annual .dot { transform:translateX(22px); }
.dim { color:var(--muted); }
.plans { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:16px; align-items:start; }
.plan { border:1px solid var(--border); background:var(--card); border-radius:18px; padding:24px; display:flex; flex-direction:column; position:relative; }
.plan.pop { border-color:rgba(99,102,241,0.55); box-shadow:0 0 40px rgba(99,102,241,0.12); }
.plan .tag { position:absolute; top:-12px; left:50%; transform:translateX(-50%); font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; background:linear-gradient(90deg,var(--indigo),var(--fuchsia)); color:#fff; padding:4px 12px; border-radius:999px; }
.plan h3 { margin:0 0 6px; font-size:17px; }
.plan .pdesc { color:var(--muted); font-size:13px; min-height:40px; margin:0 0 16px; }
.plan .price { font-size:34px; font-weight:800; }
.plan .price small { font-size:13px; font-weight:400; color:var(--muted); }
.plan .yearly { font-size:11px; color:var(--muted); min-height:16px; margin-bottom:16px; }
.plan ul { list-style:none; padding:0; margin:0 0 20px; flex:1; }
.plan li { font-size:13px; color:var(--text); padding:5px 0 5px 24px; position:relative; }
.plan li::before { content:"✓"; position:absolute; left:2px; color:var(--accent); font-weight:700; font-size:12px; }
.plan .cta { display:block; text-align:center; padding:11px; border-radius:12px; font-size:13px; font-weight:600; text-decoration:none; color:#fff; border:1px solid var(--border); background:rgba(255,255,255,0.06); }
.plan.pop .cta { background:linear-gradient(90deg,var(--indigo),var(--fuchsia)); border:0; }
.trial-note { text-align:center; color:var(--muted); font-size:13px; margin-top:20px; }
.calc { border:1px solid var(--border); background:var(--card); border-radius:22px; padding:36px; display:grid; grid-template-columns:1fr 1fr; gap:36px; align-items:center; }
@media (max-width:800px){ .calc { grid-template-columns:1fr; } }
.calc h2 { text-align:left; }
.calc .section-sub { text-align:left; margin-left:0; }
.slider-row { margin-bottom:20px; }
.slider-row .lbl { display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px; }
.slider-row .val { font-variant-numeric:tabular-nums; color:var(--accent); font-weight:700; }
input[type=range] { width:100%; accent-color:var(--indigo); }
.calc-result { border:1px solid var(--border); background:var(--bg); border-radius:16px; padding:32px; text-align:center; }
.calc-result .big { font-size:44px; font-weight:800; }
.calc-result .divider { border-top:1px dashed var(--border); margin:22px 0; }
.calc-result .save-big { font-size:28px; font-weight:800; color:var(--good); }
.calc-result .mini { font-size:12px; color:var(--muted); margin-top:6px; }
.feats { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
.feat { border:1px solid var(--border); background:var(--card); border-radius:18px; padding:26px; }
.feat h3 { margin:0 0 8px; font-size:16px; }
.feat p { margin:0; color:var(--muted); font-size:13.5px; }
footer { border-top:1px solid var(--border); padding:36px 24px; text-align:center; color:var(--muted); font-size:13px; }
footer a { margin:0 10px; }
</style>
</head>
<body>
<nav><div class="wrap">
  <a class="logo" href="/"><span class="mark">N</span>nexus</a>
  <a class="nav-cta" href="/welcome">Start free</a>
</div></nav>

<header class="hero">
  <span class="kicker" id="kicker">The site builder that works both ways</span>
  <h1 id="headline">One flat plan. <span class="grad">No plugin stack.</span></h1>
  <p class="sub" id="subline">Visual blocks, AI site generation, A/B testing, working forms, and cookieless analytics — built in, not bolted on with five subscriptions.</p>
  <div class="toggle-row">
    <div class="seg">
      <button id="aud-owner" class="on" type="button">I run a business</button>
      <button id="aud-agency" type="button">I build sites for clients</button>
    </div>
  </div>
</header>

<div class="wrap">
<section id="plans-section">
  <h2>Simple flat pricing</h2>
  <p class="section-sub">Every plan includes the full block library, themes, the guided setup wizard, working forms, media, and built-in analytics.</p>
  <div class="bill-row">
    <span id="lbl-monthly">Monthly</span>
    <button class="switch" id="bill-switch" type="button" aria-label="Toggle annual billing"><span class="dot"></span></button>
    <span id="lbl-annual" class="dim">Annual <span class="save">2 months free</span></span>
  </div>

  <div class="plans">
    <div class="plan">
      <h3>Starter</h3>
      <p class="pdesc" id="d-starter">For one site done right.</p>
      <div class="price">$<span id="p-starter">19</span><small>/mo</small></div>
      <div class="yearly" id="y-starter"></div>
      <ul>
        <li>1 workspace with a custom domain</li>
        <li>25+ blocks, multi-column layouts, theme wizard</li>
        <li>Working contact forms with an inbox</li>
        <li>Media library (10 GB)</li>
        <li>Built-in cookieless analytics</li>
        <li>2 team members</li>
      </ul>
      <a class="cta" href="/welcome">Start free trial</a>
    </div>

    <div class="plan pop">
      <span class="tag">Most popular</span>
      <h3>Pro</h3>
      <p class="pdesc" id="d-pro">For sites that are serious about converting.</p>
      <div class="price">$<span id="p-pro">49</span><small>/mo</small></div>
      <div class="yearly" id="y-pro"></div>
      <ul>
        <li>Everything in Starter</li>
        <li>Section-level A/B testing</li>
        <li>Version history with one-click restore</li>
        <li>Custom code: Script blocks + Full HTML mode</li>
        <li>Unlimited team members</li>
        <li>Priority support</li>
      </ul>
      <a class="cta" href="/welcome">Start free trial</a>
    </div>

    <div class="plan">
      <h3>Agency</h3>
      <p class="pdesc" id="d-agency">For teams running client sites.</p>
      <div class="price">$<span id="p-agency">149</span><small>/mo</small></div>
      <div class="yearly" id="y-agency"></div>
      <ul>
        <li>10 client workspaces</li>
        <li>White-label editor — your brand, not ours</li>
        <li>Jump into any client workspace instantly</li>
        <li>Client-safe editing (lock the editor to visual mode)</li>
        <li>Everything in Pro, per workspace</li>
      </ul>
      <a class="cta" href="mailto:hello@comleycreative.com?subject=Nexus%20Agency">Talk to us</a>
    </div>
  </div>
  <p class="trial-note">14-day free trial on every plan. No card required to start. Cancel anytime from your Billing page.</p>
</section>

<section>
  <div class="calc">
    <div>
      <h2>What the plugin stack really costs</h2>
      <p class="section-sub">Getting the same capabilities on a typical website platform means stacking separate subscriptions. Drag the sliders to match what you pay today.</p>
      <div class="slider-row">
        <div class="lbl"><span>Page builder plugin</span><span class="val" id="v-builder">$19/mo</span></div>
        <input type="range" min="0" max="100" step="1" value="19" id="s-builder">
      </div>
      <div class="slider-row">
        <div class="lbl"><span>A/B testing tool</span><span class="val" id="v-ab">$99/mo</span></div>
        <input type="range" min="0" max="250" step="1" value="99" id="s-ab">
      </div>
      <div class="slider-row">
        <div class="lbl"><span>Forms tool</span><span class="val" id="v-forms">$29/mo</span></div>
        <input type="range" min="0" max="100" step="1" value="29" id="s-forms">
      </div>
      <div class="slider-row">
        <div class="lbl"><span>Analytics tool</span><span class="val" id="v-stats">$19/mo</span></div>
        <input type="range" min="0" max="100" step="1" value="19" id="s-stats">
      </div>
      <div class="slider-row">
        <div class="lbl"><span>Hosting</span><span class="val" id="v-host">$20/mo</span></div>
        <input type="range" min="0" max="100" step="1" value="20" id="s-host">
      </div>
    </div>
    <div class="calc-result">
      <div class="dim" style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Your stack today</div>
      <div class="big" id="calc-total">$186<small style="font-size:14px;color:var(--muted);">/mo</small></div>
      <div class="divider"></div>
      <div class="dim" style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Nexus Pro, all of it built in</div>
      <div class="big" style="font-size:30px;">$49<small style="font-size:13px;color:var(--muted);">/mo</small></div>
      <div class="save-big" id="calc-save">You keep $137/mo</div>
      <div class="mini">Same capabilities. One bill. Nothing to duct-tape together.</div>
    </div>
  </div>
</section>

<section>
  <h2 id="feat-title">Three things nobody else does</h2>
  <p class="section-sub" id="feat-sub">These aren't add-ons — they're why Nexus exists.</p>
  <div class="feats">
    <div class="feat">
      <h3>📋 Paste in any site</h3>
      <p>Copy a page's HTML from anywhere and paste it in. Nexus segments it into editable blocks — AI classifies the tricky parts — and re-skins it in your theme. Migrations take minutes, not weekends.</p>
    </div>
    <div class="feat">
      <h3>✨ Describe it, AI builds it</h3>
      <p>Tell Nexus about your business in a sentence or two. It writes the copy, picks a theme, and assembles a complete multi-page site from real blocks — every piece editable afterward.</p>
    </div>
    <div class="feat" id="feat-third">
      <h3>🎨 A theme wizard anyone can drive</h3>
      <p>Colors, fonts, and sizing chosen through a guided setup with a live preview — every block on every page restyles instantly. No CSS required, ever.</p>
    </div>
  </div>
</section>
</div>

<footer>
  <div><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
  <div style="margin-top:10px;">© 2026 Comley Creative. Payments by Stripe. No cookies used on this page.</div>
</footer>

<script>
(function () {
  // Audience toggle: same plans, copy re-aimed at the reader.
  var COPY = {
    owner: {
      kicker: 'The site builder that works both ways',
      headline: 'One flat plan. <span class="grad">No plugin stack.</span>',
      subline: 'Visual blocks, AI site generation, A/B testing, working forms, and cookieless analytics — built in, not bolted on with five subscriptions.',
      dStarter: 'For one site done right.',
      dPro: 'For sites that are serious about converting.',
      dAgency: 'For teams running client sites.',
      featTitle: 'Three things nobody else does',
      featSub: 'These aren’t add-ons — they’re why Nexus exists.'
    },
    agency: {
      kicker: 'The agency CMS',
      headline: 'Hand clients an editor <span class="grad">they can’t break.</span>',
      subline: 'Migrate a site by pasting it in, restyle it with the theme wizard, lock the editor to visual-only, and put your brand on the whole thing.',
      dStarter: 'For your own studio site.',
      dPro: 'For a flagship client build.',
      dAgency: 'Ten client workspaces under your brand.',
      featTitle: 'Built for the client hand-off',
      featSub: 'Everything between “won the project” and “client edits it themselves.”'
    }
  };
  var PRICES = { starter: 19, pro: 49, agency: 149 };
  var annual = false;
  var audience = 'owner';

  function $(id) { return document.getElementById(id); }

  function render() {
    var c = COPY[audience];
    $('kicker').textContent = c.kicker;
    $('headline').innerHTML = c.headline;
    $('subline').textContent = c.subline;
    $('d-starter').textContent = c.dStarter;
    $('d-pro').textContent = c.dPro;
    $('d-agency').textContent = c.dAgency;
    $('feat-title').textContent = c.featTitle;
    $('feat-sub').textContent = c.featSub;

    Object.keys(PRICES).forEach(function (k) {
      var monthly = PRICES[k];
      var yr = monthly * 10; // annual = 2 months free
      $('p-' + k).textContent = annual ? Math.round(yr / 12) : monthly;
      $('y-' + k).textContent = annual ? 'billed annually ($' + yr + '/yr)' : '';
    });
    $('lbl-monthly').className = annual ? 'dim' : '';
    $('lbl-annual').className = annual ? '' : 'dim';
    $('bill-switch').classList.toggle('annual', annual);
    $('aud-owner').classList.toggle('on', audience === 'owner');
    $('aud-agency').classList.toggle('on', audience === 'agency');
  }

  function calc() {
    var ids = ['builder', 'ab', 'forms', 'stats', 'host'];
    var total = 0;
    ids.forEach(function (id) {
      var v = parseInt($('s-' + id).value, 10) || 0;
      $('v-' + id).textContent = '$' + v + '/mo';
      total += v;
    });
    $('calc-total').innerHTML = '$' + total + '<small style="font-size:14px;color:var(--muted);">/mo</small>';
    var saved = Math.max(0, total - 49);
    $('calc-save').textContent = saved > 0 ? 'You keep $' + saved + '/mo' : 'About the same — but one bill';
  }

  $('aud-owner').addEventListener('click', function () { audience = 'owner'; render(); });
  $('aud-agency').addEventListener('click', function () { audience = 'agency'; render(); });
  $('bill-switch').addEventListener('click', function () { annual = !annual; render(); });
  ['builder', 'ab', 'forms', 'stats', 'host'].forEach(function (id) {
    $('s-' + id).addEventListener('input', calc);
  });

  render();
  calc();

  // Built-in analytics beacon (Full HTML pages bypass the automatic
  // injection, so it's included by hand).
  if (navigator.sendBeacon) navigator.sendBeacon('/api/public/pv', JSON.stringify({ p: location.pathname }));
})();
</script>
</body>
</html>$wn$
  )
)
on conflict (id) do nothing;
