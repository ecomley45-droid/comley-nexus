import { Link } from 'react-router-dom';
import { Building2, FileText, Users, Rocket } from 'lucide-react';
import { GlassPanel, GlassButton } from './ui/Glass.jsx';
import { useMe, useOrgBase } from './useMe.jsx';

// First-run welcome, shown at the top of the Dashboard while the workspace
// is still empty. Each card is a discrete "get set up" step so a new
// client isn't staring at a blank Dashboard on their first visit.
//
// The heuristic for "empty workspace" is deliberately conservative — we
// hide the cards as soon as the org has ANY published page, or has
// customized the workspace name past the default.

const STEPS = ({ base, orgName }) => [
  {
    icon: Building2,
    title: 'Name your workspace',
    body: `You're set up as "${orgName}". Change the name, timezone, and branding on the Workspace page.`,
    ctaLabel: 'Workspace settings',
    ctaTo: `${base}/settings/workspace`,
  },
  {
    icon: FileText,
    title: 'Build your first page',
    body: 'Pages are the heart of Nexus. Create a page, add sections, and hit publish when it looks right.',
    ctaLabel: 'New page',
    ctaTo: `${base}/pages`,
  },
  {
    icon: Users,
    title: 'Invite your team',
    body: 'Bring editors and viewers in. Each gets their own sign-in and role.',
    ctaLabel: 'Add team members',
    ctaTo: `${base}/team`,
  },
  {
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
  if (!me?.org) return null;

  const hasPublishedPage = Array.isArray(pages) && pages.some((p) => p.status === 'published');
  const orgName = me.org.name;
  // "admin" is the bootstrap slug for Ethan's org, whose name is set. We
  // treat the welcome cards as done once the workspace has any published
  // page — that's the strongest signal they've started actually using it.
  if (hasPublishedPage) return null;

  const steps = STEPS({ base, orgName });

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Welcome to {orgName}</h2>
        <p className="text-sm text-zinc-400">
          A few steps to get your workspace set up. You can skip any of them
          and come back later.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {steps.map(({ icon: Icon, title, body, ctaLabel, ctaTo }) => (
          <GlassPanel key={title} className="p-4 flex flex-col">
            <div className="flex items-start gap-3 mb-3">
              <Icon className="w-5 h-5 text-glass-sky mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-100">{title}</div>
                <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{body}</div>
              </div>
            </div>
            <div className="mt-auto">
              <Link to={ctaTo}>
                <GlassButton variant="secondary" className="text-xs w-full">{ctaLabel}</GlassButton>
              </Link>
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
