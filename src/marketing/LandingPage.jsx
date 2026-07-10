import { Link, useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';
import { Rocket, Layers, Zap, ShieldCheck, GitBranch, Sparkles } from 'lucide-react';
import { GlassShell, GlassPanel, GlassButton } from '../cms/lib/ui/Glass.jsx';
import { useMe } from '../cms/lib/useMe.jsx';

// Public marketing landing at nexus.comleycreative.com/.
// When a signed-in user arrives here, we send them straight to their org's
// CMS at /:orgSlug so they don't have to click "Sign in" then be bounced.
// When they're signed out, we show the marketing pitch + a CTA that opens
// Clerk's hosted sign-in flow.
//
// Copy is intentionally light — this is the first thing every prospect
// sees, so it stays focused on "what is Nexus, and why should I care".

const FEATURES = [
  {
    icon: Layers,
    title: 'Everything in one console',
    body: 'Pages, media, commerce, feedback, publishing — a single workspace instead of ten separate SaaS tabs.',
  },
  {
    icon: Sparkles,
    title: 'AI-native content',
    body: 'Draft, edit, and audit pages with your model of choice. Claude, GPT, and Gemini plug in per-account.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by default',
    body: 'Clerk auth, sanitized HTML, rate limits, and a strict CSP on every published page.',
  },
  {
    icon: GitBranch,
    title: 'Real dev workflows',
    body: 'Git-pull tracking, scheduled publishes, version history, per-section A/B tests — no more branch guesswork.',
  },
  {
    icon: Rocket,
    title: 'Ship in minutes',
    body: 'Vercel + Supabase under the hood. New client instances launch behind a single CLI command.',
  },
  {
    icon: Zap,
    title: 'Ops surface built in',
    body: 'Feedback tickets, system status, personal stats — the ops console your team was going to build anyway.',
  },
];

function AutoRedirectSignedIn() {
  const navigate = useNavigate();
  const { me, loading } = useMe();
  if (loading) return <p className="text-sm text-zinc-400">Loading workspace…</p>;
  const slug = me?.org?.slug;
  if (!slug) {
    // Signed in but not a member of any org — send them to a friendly
    // "request access" panel rather than a hostile 403.
    Promise.resolve().then(() => navigate('/no-workspace', { replace: true }));
    return <p className="text-sm text-zinc-400">Checking workspace access…</p>;
  }
  Promise.resolve().then(() => navigate(`/${slug}`, { replace: true }));
  return <p className="text-sm text-zinc-400">Taking you to your workspace…</p>;
}

function TopBar() {
  return (
    <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
      <Link to="/" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-glass-indigo via-glass-fuchsia to-glass-sky" />
        <span className="text-lg font-semibold tracking-tight">Nexus</span>
      </Link>
      <div className="flex items-center gap-3">
        <SignedOut>
          <SignInButton mode="modal">
            <GlassButton variant="secondary" className="text-sm">Sign in</GlassButton>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <AutoRedirectSignedIn />
        </SignedIn>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative px-6 pt-16 pb-24 text-center max-w-4xl mx-auto">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 mb-8">
        <Sparkles className="w-3.5 h-3.5 text-glass-fuchsia" />
        <span>Now in early access</span>
      </div>
      <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] mb-6">
        The workspace your product<br />
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-glass-indigo via-glass-fuchsia to-glass-sky">
          actually runs on.
        </span>
      </h1>
      <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
        Nexus is the internal console every growing team ends up building — pages, commerce,
        feedback, publishing, and AI drafting, all in one place. Ship faster, argue less.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <SignedOut>
          <SignInButton mode="modal">
            <GlassButton className="text-sm px-6 py-3">Get started</GlassButton>
          </SignInButton>
          <a href="mailto:hello@comleycreative.com?subject=Nexus%20demo" className="inline-block">
            <GlassButton variant="secondary" className="text-sm px-6 py-3">Book a demo</GlassButton>
          </a>
        </SignedOut>
        <SignedIn>
          <AutoRedirectSignedIn />
        </SignedIn>
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section className="px-6 py-16 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
          One console. Every tool your team stops paying for.
        </h2>
        <p className="text-zinc-400 max-w-2xl mx-auto">
          Nexus replaces the sprawl of point tools with a single, opinionated workspace tuned
          for how modern product teams actually work.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <GlassPanel key={title} className="p-6">
            <Icon className="w-6 h-6 text-glass-sky mb-4" />
            <h3 className="font-semibold text-zinc-100 mb-2">{title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
          </GlassPanel>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="px-6 py-24 max-w-3xl mx-auto text-center">
      <GlassPanel className="p-12">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
          Ready when you are.
        </h2>
        <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
          Nexus is invite-only during early access. Reach out and we'll spin up a workspace
          for your team in about ten minutes.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <SignedOut>
            <SignInButton mode="modal">
              <GlassButton className="text-sm px-6 py-3">Sign in</GlassButton>
            </SignInButton>
            <a href="mailto:hello@comleycreative.com?subject=Nexus%20access" className="inline-block">
              <GlassButton variant="secondary" className="text-sm px-6 py-3">Request access</GlassButton>
            </a>
          </SignedOut>
          <SignedIn>
            <AutoRedirectSignedIn />
          </SignedIn>
        </div>
      </GlassPanel>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-6 py-8 max-w-6xl mx-auto w-full flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm text-zinc-500 border-t border-white/5 mt-12">
      <div>© {new Date().getFullYear()} Comley Creative. All rights reserved.</div>
      <div className="flex items-center gap-4">
        <a href="mailto:hello@comleycreative.com" className="hover:text-zinc-300">Contact</a>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <GlassShell>
      <TopBar />
      <Hero />
      <FeatureGrid />
      <CTA />
      <Footer />
    </GlassShell>
  );
}
