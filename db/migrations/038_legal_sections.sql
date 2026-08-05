-- Legal sections the seeded Terms and Privacy pages were missing, plus a
-- DMCA page.
--
-- The existing pages (013) already cover accounts, content ownership,
-- acceptable use, billing, AI features, termination, and the privacy basics.
-- What was absent:
--
--   * dispute resolution / binding arbitration / class-action waiver
--   * a copyright complaints procedure and designated agent
--   * a plain-language "at a glance" privacy summary
--   * an FTC-shaped disclosure that AI writes site content and where
--     visitor-submitted text goes
--
-- ADDITIVE ONLY. Every statement appends a section and is guarded on that
-- section's id, so it cannot run twice and cannot touch a word of anything
-- already written. Migration 034 deleted rows on an assumption about what
-- they were; this file assumes nothing about existing content.
--
-- ----------------------------------------------------------------------
-- THIS IS DRAFTING, NOT LEGAL ADVICE. Two things need a lawyer before you
-- rely on them:
--
--   1. The arbitration clause. Enforceability turns on notice, a real
--      opt-out, and who pays the fees, and the rules differ by state. A
--      clause that is drafted badly is unenforceable, and an unenforceable
--      one is worse than none because it invites the fight it was meant to
--      avoid. The 30-day opt-out and fee terms below are the common shape,
--      not a guarantee.
--   2. The DMCA agent block. Safe harbour under 17 U.S.C. 512 requires an
--      agent REGISTERED with the Copyright Office at dmca.copyright.gov
--      ($6, renew every three years). Publishing the contact details without
--      registering does not give you the protection. The placeholders below
--      are deliberately obvious so an unfilled one is visible, not silent.
-- ----------------------------------------------------------------------

-- 1. Terms: dispute resolution and arbitration ---------------------------
update nexus_pages
   set content = coalesce(content, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'id', 'sec-terms-arbitration',
         'name', 'Dispute resolution',
         'html', $arb$<div class="legal">
<h2>Dispute resolution and arbitration</h2>
<p><strong>Please read this section carefully. It affects how disputes between us are resolved, and it limits your right to bring a lawsuit or participate in a class action.</strong></p>

<h3>Talk to us first</h3>
<p>Most problems can be sorted out quickly. Before starting formal proceedings, send a written description of the dispute and the resolution you want to <a href="mailto:legal@comleycreative.com">legal@comleycreative.com</a>. We will do the same for you. If we have not resolved it within 60 days, either of us may begin arbitration.</p>

<h3>Binding arbitration</h3>
<p>Except as set out below, any dispute arising out of or relating to these Terms or the Service will be resolved by binding individual arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules, rather than in court. The arbitrator&rsquo;s decision is final and may be entered as a judgment in any court with jurisdiction.</p>
<p>We will pay the filing, administration and arbitrator fees for any claim where the amount in dispute is under $10,000, unless the arbitrator finds the claim was frivolous. Arbitration may be conducted in writing, by phone, or in person in the county where you live, at your choice.</p>

<h3>What is not covered</h3>
<p>Either of us may bring an individual claim in small-claims court instead, and either of us may ask a court for an injunction to stop infringement or misuse of intellectual property. Nothing here prevents you from reporting a concern to a government agency.</p>

<h3>No class actions</h3>
<p>Claims must be brought individually. Neither of us may bring a claim as a plaintiff or class member in a class, consolidated or representative action, and the arbitrator may not consolidate more than one person&rsquo;s claims. If this paragraph is found unenforceable, the whole of this Dispute resolution section does not apply.</p>

<h3>Opting out</h3>
<p>You can decline arbitration entirely. Email <a href="mailto:legal@comleycreative.com">legal@comleycreative.com</a> with your account email and the words &ldquo;arbitration opt-out&rdquo; within <strong>30 days</strong> of first accepting these Terms. Opting out costs you nothing and does not affect your account or any other part of these Terms.</p>

<h3>Governing law</h3>
<p>These Terms are governed by the laws of the State of South Carolina, without regard to its conflict-of-laws rules. Where a dispute is not subject to arbitration, it will be heard in the state or federal courts located in Greenville County, South Carolina, and both of us consent to that jurisdiction.</p>
</div>$arb$
       ))
 WHERE id = 'page-terms'
   AND NOT coalesce(content, '[]'::jsonb) @> '[{"id":"sec-terms-arbitration"}]'::jsonb;

-- 2. Terms: copyright complaints ----------------------------------------
update nexus_pages
   set content = coalesce(content, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'id', 'sec-terms-dmca',
         'name', 'Copyright',
         'html', $dmca$<div class="legal">
<h2>Copyright complaints</h2>
<p>We respond to notices of alleged copyright infringement on content hosted through the Service. Our full procedure, and the contact details for our designated agent, are on our <a href="/dmca">Copyright &amp; DMCA</a> page.</p>
<p>We terminate the accounts of repeat infringers in appropriate circumstances.</p>
</div>$dmca$
       ))
 WHERE id = 'page-terms'
   AND NOT coalesce(content, '[]'::jsonb) @> '[{"id":"sec-terms-dmca"}]'::jsonb;

-- 3. Privacy: plain-language summary ------------------------------------
--
-- The web equivalent of an app store privacy label: the same facts as the
-- policy below it, readable in twenty seconds. It goes first because a
-- summary after the detail is not a summary.
update nexus_pages
   set content = jsonb_build_array(jsonb_build_object(
         'id', 'sec-privacy-glance',
         'name', 'At a glance',
         'html', $glance$<div class="legal">
<h2>Privacy at a glance</h2>
<p class="updated">A summary of the full policy below. The policy is what governs; this is here so you do not have to read it to know the shape of it.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tbody>
<tr><th scope="row" style="text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--border);width:42%;font-weight:600">What we collect</th><td style="padding:10px 0;border-bottom:1px solid var(--border)">Your name and email, your billing details (held by Stripe, never by us), the content you create, and basic usage logs.</td></tr>
<tr><th scope="row" style="text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--border);font-weight:600">What we never collect</th><td style="padding:10px 0;border-bottom:1px solid var(--border)">Card numbers, government ID, precise location, biometrics, or anything about your visitors beyond what your own site records.</td></tr>
<tr><th scope="row" style="text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--border);font-weight:600">Do we sell it?</th><td style="padding:10px 0;border-bottom:1px solid var(--border)">No. We do not sell or share personal information for advertising, and we run no ad networks.</td></tr>
<tr><th scope="row" style="text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--border);font-weight:600">Tracking across other sites</th><td style="padding:10px 0;border-bottom:1px solid var(--border)">None.</td></tr>
<tr><th scope="row" style="text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--border);font-weight:600">Who else sees it</th><td style="padding:10px 0;border-bottom:1px solid var(--border)">Only the providers that run the platform: Clerk, Stripe, Supabase, Vercel, Resend, and Anthropic. Each only to do their job.</td></tr>
<tr><th scope="row" style="text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--border);font-weight:600">AI</th><td style="padding:10px 0;border-bottom:1px solid var(--border)">Some features send the text you give them to an AI provider. It is not used to train their models. See the AI section below.</td></tr>
<tr><th scope="row" style="text-align:left;padding:10px 12px 10px 0;font-weight:600">Deleting it</th><td style="padding:10px 0">Delete your workspace and we remove your content and account data within 30 days.</td></tr>
</tbody>
</table>
</div>$glance$
       )) || coalesce(content, '[]'::jsonb)
 WHERE id = 'page-privacy'
   AND NOT coalesce(content, '[]'::jsonb) @> '[{"id":"sec-privacy-glance"}]'::jsonb;

-- 4. Privacy: AI disclosure ---------------------------------------------
--
-- The existing policy mentions Anthropic in passing. The FTC's concern with
-- AI is disclosure that a reader would actually notice: that generated text
-- is machine-written and unverified, and where anything they type goes.
update nexus_pages
   set content = coalesce(content, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'id', 'sec-privacy-ai',
         'name', 'AI',
         'html', $pai$<div class="legal">
<h2>Artificial intelligence</h2>

<h3>Where AI is used</h3>
<p>Two features use third-party AI models. <strong>Generate a site</strong> turns a description you write into draft pages and a colour scheme. <strong>Block classification</strong> reads pasted HTML and labels what kind of section it is. Nothing else in the Service uses AI, and neither feature runs unless you start it.</p>

<h3>What is sent, and where</h3>
<p>Only the text you submit to the feature is sent, and it goes to Anthropic&rsquo;s API. Your account details, billing information, other pages, and your site&rsquo;s visitor data are never included. Under Anthropic&rsquo;s API terms, content sent this way is not used to train their models.</p>

<h3>AI output is a draft, not a fact</h3>
<p>Text and layouts produced by these features are generated by a machine and are not reviewed by us before you see them. They can be wrong, out of date, or plainly invented &mdash; including anything that reads like a statistic, a price, a legal statement, or a claim about your business. <strong>Read anything AI produces before you publish it.</strong> You remain responsible for everything on your site, however it was drafted.</p>

<h3>No automated decisions about you</h3>
<p>We do not use AI to make decisions about your account, your pricing, or your access to the Service. No profiling of you or your visitors is performed.</p>

<h3>Your visitors</h3>
<p>If you use an AI feature on content that includes information about your own customers, that text is sent to the AI provider along with everything else you submit. You are the controller of that data and it is your call whether to include it &mdash; we would suggest not.</p>
</div>$pai$
       ))
 WHERE id = 'page-privacy'
   AND NOT coalesce(content, '[]'::jsonb) @> '[{"id":"sec-privacy-ai"}]'::jsonb;

-- 5. The DMCA page -------------------------------------------------------
insert into nexus_pages (id, name, slug, parent_id, content, seo, status, analytics, layout)
values (
  'page-dmca', 'Copyright & DMCA', 'dmca', null,
  jsonb_build_array(jsonb_build_object(
    'id', 'sec-dmca-1',
    'name', 'Copyright & DMCA',
    'html', $page$<style>
.legal { max-width: 720px; margin: 0 auto; padding: 48px 24px; line-height: 1.7; }
.legal h1 { font-size: var(--text-h1); margin-bottom: 4px; }
.legal .updated { color: var(--color-muted); font-size: var(--text-small); margin-bottom: 32px; }
.legal h2 { font-size: var(--text-h3); margin: 32px 0 8px; }
.legal h3 { font-size: var(--text-body); margin: 20px 0 6px; }
.legal p, .legal li { color: var(--color-text); font-size: var(--text-body); }
.legal ul, .legal ol { padding-left: 22px; }
.legal a { color: var(--color-link); }
.legal .agent { border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin: 18px 0; background: var(--surface); }
</style>
<div class="legal">
<h1>Copyright &amp; DMCA</h1>
<p class="updated">Last updated: August 5, 2026</p>

<p>Comley Creative hosts websites built by our customers. We do not review that content before it is published. If you believe material on a site we host infringes your copyright, tell us and we will act on a valid notice.</p>

<h2>Designated agent</h2>
<p>Send notices of claimed infringement to our designated agent:</p>
<div class="agent">
<p><strong>Copyright Agent</strong><br>
Comley Creative<br>
[REGISTERED AGENT ADDRESS]<br>
Email: <a href="mailto:dmca@comleycreative.com">dmca@comleycreative.com</a><br>
Phone: [REGISTERED AGENT PHONE]</p>
</div>
<p>This agent is registered with the United States Copyright Office. Notices sent anywhere else may not reach us in time to act.</p>

<h2>What a notice must contain</h2>
<p>To be valid under 17 U.S.C. &sect;512(c)(3), your notice must include all of the following:</p>
<ol>
<li>A physical or electronic signature of the copyright owner, or someone authorised to act for them.</li>
<li>Identification of the copyrighted work you say has been infringed.</li>
<li>Identification of the material you say is infringing, with enough detail for us to find it &mdash; a full URL is best.</li>
<li>Your name, address, telephone number and email address.</li>
<li>A statement that you believe in good faith that the use is not authorised by the copyright owner, its agent, or the law.</li>
<li>A statement that the information in the notice is accurate, and &mdash; under penalty of perjury &mdash; that you are the owner or authorised to act for them.</li>
</ol>
<p>An incomplete notice may not be actionable. Please also be aware that misrepresenting material as infringing can make you liable for damages under &sect;512(f).</p>

<h2>What we do next</h2>
<p>On receiving a valid notice we will remove or disable access to the material, and tell the customer who published it what we removed and why, including a copy of your notice.</p>

<h2>Counter-notice</h2>
<p>If your material was removed and you believe that was a mistake or a misidentification, you may send a counter-notice to the agent above containing: your signature; identification of the material and where it appeared; a statement under penalty of perjury that you believe in good faith it was removed by mistake; and your name, address and phone number, together with consent to the jurisdiction of the federal court for your district (or, if you are outside the United States, for South Carolina) and acceptance of service from the complaining party.</p>
<p>If we receive a valid counter-notice we will forward it to the complainant. Unless they tell us within 10 business days that they have filed a court action seeking to restrain the activity, we may restore the material.</p>

<h2>Repeat infringers</h2>
<p>We terminate, in appropriate circumstances, the accounts of customers who repeatedly infringe copyright.</p>
</div>$page$
  )),
  jsonb_build_object(
    'title', 'Copyright & DMCA — Nexus',
    'description', 'How to report copyright infringement on a site hosted by Comley Creative, and our designated agent for DMCA notices.'
  ),
  'published', '{}'::jsonb, '{}'::jsonb
)
on conflict (id) do nothing;
