import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { GlassShell, GlassPanel, GlassButton, GlassInput } from '../lib/ui/Glass.jsx';
import { getSiteTemplates, createWorkspace } from '../lib/api.js';
import { useMe, useIsSuperAdmin } from '../lib/useMe.jsx';

// Self-serve workspace creation for a signed-in user who has no workspace
// yet (RequireOrg forwards them here instead of the old dead-end "No
// workspace on this account" panel). Creates the org, makes them its
// admin, optionally applies a starter site, then drops them into their
// new dashboard on a 14-day trial.

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function CreateWorkspaceForm() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [templateId, setTemplateId] = useState('agency');
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { me, loading, refresh } = useMe();
  const isSuperAdmin = useIsSuperAdmin();

  useEffect(() => { getSiteTemplates().then(setTemplates).catch(() => {}); }, []);

  // Already have a workspace? Straight to it. A platform super-admin with no
  // client workspace belongs in the Super Admin portal, not this create-a-
  // workspace form.
  useEffect(() => {
    if (loading) return;
    if (me?.org?.slug) navigate(`/${me.org.slug}`, { replace: true });
    else if (isSuperAdmin) navigate('/super-admin', { replace: true });
  }, [loading, me, isSuperAdmin]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const { org } = await createWorkspace({ name: name.trim(), slug: slug.trim(), templateId: templateId || null });
      await refresh();
      navigate(`/${org.slug}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto pt-16 px-6 pb-16">
      <h1 className="text-3xl font-semibold mb-2">Create your workspace</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Your site, pages, and team live here. Free for 14 days — no card needed to start.
      </p>
      <GlassPanel className="p-5">
        <label className="text-xs text-zinc-400 block mb-1">Workspace name</label>
        <GlassInput
          value={name}
          onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
          placeholder="Acme Co"
          className="w-full mb-3"
        />

        <label className="text-xs text-zinc-400 block mb-1">Workspace URL</label>
        <GlassInput
          value={slug}
          onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
          placeholder="acme"
          className="w-full mb-1"
        />
        <p className="text-[11px] text-zinc-500 mb-4">
          nexuscmshub.com/<span className="text-zinc-300">{slug || 'acme'}</span>
        </p>

        <label className="text-xs text-zinc-400 block mb-2">Start with</label>
        <div className="grid grid-cols-1 gap-2 mb-4">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`text-left rounded-xl border p-3 transition ${templateId === t.id ? 'border-glass-indigo bg-white/10' : 'border-white/10 hover:border-white/25'}`}
            >
              <div className="text-sm text-zinc-100">{t.name}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{t.description}</div>
            </button>
          ))}
          <button
            onClick={() => setTemplateId('')}
            className={`text-left rounded-xl border border-dashed p-3 transition ${templateId === '' ? 'border-glass-indigo bg-white/10' : 'border-white/15 hover:border-white/30'}`}
          >
            <div className="text-sm text-zinc-300">Blank workspace</div>
            <div className="text-xs text-zinc-500 mt-0.5">Start from an empty page list.</div>
          </button>
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <GlassButton onClick={submit} disabled={busy || !name.trim()} className="w-full justify-center">
          {busy ? 'Setting up your workspace…' : 'Create workspace'}
        </GlassButton>
      </GlassPanel>
    </div>
  );
}

// Nexus Command's own origin -- hardcoded, same as the frame-ancestors CSP
// entry already in server.js (both already reference command.comleynexus.com
// directly; no env var for it exists anywhere in the ecosystem yet). Used
// only to build the "sign up via Comley Nexus" link below -- see the new
// POST /api/session/handoff + GET /sign-up?handoff=cms flow in nexus-core's
// apps/command.
const COMMAND_SIGN_UP_URL = 'https://command.comleynexus.com/sign-up';

// This is the entry point new users actually land on -- LandingPage.jsx's
// "Get started" sends signed-out visitors here (via navigate('/welcome')),
// not through RequireOrg's/RequireSuperAdmin's auto-RedirectToSignIn (those
// guard already-linked app routes, not new-user acquisition). Previously
// this went straight into Clerk's own hosted Account Portal sign-up with no
// stop here; now it offers a second, additive path: hosted sign-up on
// Command. "Sign in" below preserves the exact old behavior (straight to
// Clerk's Account Portal) for existing CMS accounts -- unchanged.
function SignedOutWelcome() {
  const returnTo = typeof window !== 'undefined' ? window.location.origin : '';
  const commandSignUpHref = `${COMMAND_SIGN_UP_URL}?handoff=cms&return_to=${encodeURIComponent(returnTo)}`;
  return (
    <div className="max-w-md mx-auto pt-24 px-6 text-center">
      <GlassPanel className="p-8">
        <h1 className="text-2xl font-semibold mb-2">Welcome</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Sign in to your existing workspace, or create a new account.
        </p>
        <div className="grid gap-2">
          <RedirectToSignInButton />
          <a
            href={commandSignUpHref}
            className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
          >
            New here? Create an account via Comley Nexus
          </a>
        </div>
      </GlassPanel>
    </div>
  );
}

// SignIn's own Clerk Account Portal redirect, wrapped as a click instead of
// firing automatically -- RedirectToSignIn navigates on render, so the only
// way to show it alongside the new link above (rather than instantly
// replacing this whole page) is to defer it until the button is pressed.
function RedirectToSignInButton() {
  const [go, setGo] = useState(false);
  if (go) return <RedirectToSignIn />;
  return (
    <GlassButton onClick={() => setGo(true)} className="w-full justify-center">
      Sign in
    </GlassButton>
  );
}

export default function WelcomePage() {
  return (
    <GlassShell>
      <SignedOut><SignedOutWelcome /></SignedOut>
      <SignedIn><CreateWorkspaceForm /></SignedIn>
    </GlassShell>
  );
}
