import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileText, Users, Rocket, X } from 'lucide-react';
import { GlassPanel, GlassButton } from './ui/Glass.jsx';
import { useMe, useOrgBase } from './useMe.jsx';
import { getPreferences, savePreferences } from './api.js';

// First-run welcome, shown at the top of the Dashboard while there's still
// setup left to do. Each card is its own dismissible task, persisted per
// user via user_preferences.prefs.dismissed_dashboard_tasks -- previously
// the whole block used one all-or-nothing heuristic (hide everything once
// the org had a published page), so a step you'd already done (e.g.
// inviting your team) kept reappearing forever alongside ones you hadn't.
// "Build your first page" still auto-dismisses the same way, since that
// signal (a published page) is already on hand for free; the rest are
// dismissed by hand via the ✕ or "Done" on each card.

const STEPS = ({ base, orgName }) => [
  {
    id: 'workspace-name',
    icon: Building2,
    title: 'Name your workspace',
    body: `You're set up as "${orgName}". Change the name, timezone, and branding on the Workspace page.`,
    ctaLabel: 'Workspace settings',
    ctaTo: `${base}/settings/workspace`,
  },
  {
    id: 'first-page',
    icon: FileText,
    title: 'Build your first page',
    body: 'Pages are the heart of Nexus. Create a page, add sections, and hit publish when it looks right.',
    ctaLabel: 'New page',
    ctaTo: `${base}/pages`,
  },
  {
    id: 'invite-team',
    icon: Users,
    title: 'Invite your team',
    body: 'Bring editors and viewers in. Each gets their own sign-in and role.',
    ctaLabel: 'Add team members',
    ctaTo: `${base}/team`,
  },
  {
    id: 'custom-domain',
    icon: Rocket,
    title: 'Point your domain here',
    body: 'Ready to go live at your own URL? We\'ll help wire the DNS.',
    ctaLabel: 'Set custom domain',
    ctaTo: `${base}/settings/workspace`,
  },
];

export default function WelcomeCards({ pages }) {
  const { me } = useMe();
  const base = useOrgBase() || '/admin';
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    getPreferences().then((p) => setDismissed(p.dismissed_dashboard_tasks || [])).catch(() => setDismissed([]));
  }, []);

  if (!me?.org || dismissed === null) return null;

  const hasPublishedPage = Array.isArray(pages) && pages.some((p) => p.status === 'published');
  const orgName = me.org.name;

  const dismiss = (id) => {
    const next = [...new Set([...dismissed, id])];
    setDismissed(next);
    savePreferences({ dismissed_dashboard_tasks: next }).catch(() => {});
  };

  const isDone = (step) => dismissed.includes(step.id) || (step.id === 'first-page' && hasPublishedPage);
  const steps = STEPS({ base, orgName }).filter((step) => !isDone(step));

  if (steps.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Welcome to {orgName}</h2>
        <p className="text-sm text-zinc-400">
          A few steps to get your workspace set up. Dismiss any of them with the ✕ and they won't come back.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <GlassPanel key={step.id} className="p-4 flex flex-col relative">
              <button
                onClick={() => dismiss(step.id)}
                aria-label={`Dismiss "${step.title}"`}
                className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-200 w-6 h-6 grid place-items-center rounded-md hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-start gap-3 mb-3 pr-6">
                <Icon className="w-5 h-5 text-glass-sky mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-100">{step.title}</div>
                  <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{step.body}</div>
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <Link to={step.ctaTo} className="flex-1">
                  <GlassButton variant="secondary" className="text-xs w-full">{step.ctaLabel}</GlassButton>
                </Link>
                <button
                  onClick={() => dismiss(step.id)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 px-2"
                  title="Mark as done"
                >
                  Done
                </button>
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
