import { Link } from 'react-router-dom';
import {
  Building2, Palette, Users, Plug, CreditCard, ScrollText, Database,
  Globe2,
} from 'lucide-react';
import { GlassShell, GlassPanel } from '../lib/ui/Glass.jsx';
import { useOrgBase, useMe } from '../lib/useMe.jsx';

// Settings landing. Categorized so it doesn't feel overwhelming.
// Every card is also directly reachable from the top nav's Settings
// dropdown — this landing is a discoverability surface for the whole
// settings surface area, not the only way to reach any subpage.
//
// Client-workspace management lives at /super-admin/orgs, not here — it's
// a platform-operator concern, not a per-workspace setting.

const CATEGORIES = ({ base }) => [
  {
    group: 'Workspace',
    items: [
      { icon: Building2, label: 'Workspace', to: `${base}/settings/workspace`,
        blurb: 'Name, timezone, custom domain, maintenance mode.' },
      { icon: Palette, label: 'Design', to: `${base}/settings/design`,
        blurb: 'Theme colors, global header/footer, styleguide.' },
      { icon: Globe2, label: 'Content globals', to: `${base}/settings/design#globals`,
        blurb: 'Header, footer, and analytics that live outside any single page.' },
    ],
  },
  {
    group: 'People',
    items: [
      { icon: Users, label: 'Team & permissions', to: `${base}/team`,
        blurb: 'Add and manage viewers, editors, admins.' },
    ],
  },
  {
    group: 'Integrations & billing',
    items: [
      { icon: Plug, label: 'Integrations', to: `${base}/connections`,
        blurb: 'Connect Google, Slack, AI providers, Stripe.' },
      { icon: CreditCard, label: 'Billing', to: `${base}/settings/billing`,
        blurb: 'Plan, seats, invoices. Coming soon.' },
    ],
  },
  {
    group: 'Data & history',
    items: [
      { icon: Database, label: 'Import / export', to: `${base}/import-export`,
        blurb: 'CSV round-trips for pages, redirects, team, and more.' },
      { icon: ScrollText, label: 'Audit log', to: `${base}/audit`,
        blurb: 'Every change your team has made.' },
    ],
  },
];

function CategoryCard({ icon: Icon, label, blurb, to }) {
  return (
    <Link to={to}>
      <GlassPanel className="p-5 hover:bg-white/[0.07] transition h-full flex flex-col">
        <Icon className="w-6 h-6 text-glass-sky mb-3" />
        <div className="text-zinc-100 font-medium mb-1">{label}</div>
        <div className="text-xs text-zinc-400 leading-relaxed">{blurb}</div>
      </GlassPanel>
    </Link>
  );
}

export default function SettingsPage() {
  const base = useOrgBase() || '/admin';
  const { me } = useMe();
  const groups = CATEGORIES({ base });

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage everything about {me?.org?.name || 'your workspace'} — pick a category to get
          started, or use the Settings dropdown in the nav to jump straight in.
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.group} className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{g.group}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.items.map((item) => <CategoryCard key={item.to} {...item} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
