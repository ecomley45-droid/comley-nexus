import { CreditCard } from 'lucide-react';
import { GlassPanel, GlassButton } from '../../lib/ui/Glass.jsx';
import { useMe } from '../../lib/useMe.jsx';

// Placeholder while Stripe billing is being wired up. Shows the current
// plan (which lives on the org row) and links to a mailto for now. When
// we do add Stripe subscriptions, this page becomes the plan-picker +
// invoice history + seat management surface.

const PLAN_LABEL = {
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
  internal: 'Internal (comped)',
};

export default function BillingSettingsPage() {
  const { me } = useMe();
  const plan = me?.org?.plan || 'starter';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Billing</h1>

      <GlassPanel className="p-5 mb-4">
        <div className="flex items-start gap-4">
          <CreditCard className="w-6 h-6 text-glass-sky mt-1" />
          <div className="flex-1">
            <div className="text-sm text-zinc-400">Current plan</div>
            <div className="text-xl font-semibold text-zinc-100">
              {PLAN_LABEL[plan] || plan}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {plan === 'internal' && 'Comped for internal use — no billing.'}
              {plan === 'starter' && 'Includes the CMS + ops console for one workspace.'}
              {plan === 'growth' && 'Everything in Starter, plus commerce and higher API limits.'}
              {plan === 'enterprise' && 'Custom pricing, SLA, and dedicated support.'}
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="p-5">
        <h2 className="font-medium mb-2">Change plan or view invoices</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Self-serve billing is coming soon. For now, plan changes and invoice
          requests go through us directly.
        </p>
        <a href="mailto:hello@comleycreative.com?subject=Nexus%20billing">
          <GlassButton className="text-sm">Contact billing</GlassButton>
        </a>
      </GlassPanel>
    </div>
  );
}
