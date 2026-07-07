import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { GlassPanel, GlassButton, Badge } from '../../lib/ui/Glass.jsx';
import { getBillingStatus, startCheckout, openBillingPortal } from '../../lib/api.js';

// Plan picker + subscription status for this workspace. Checkout and
// subscription management both hand off to Stripe-hosted pages (Checkout
// and the Billing Portal) -- no card data ever touches Nexus.

const PLAN_BLURBS = {
  starter: ['1 workspace, custom domain', 'All blocks, themes, wizard', 'Forms + media (10 GB)', '2 team members'],
  pro: ['Everything in Starter', 'A/B testing + version history', 'Script & Full-HTML modes', 'Unlimited team, priority support'],
  agency: ['10 client workspaces', 'White-label editor (coming soon)', 'Jump-into-workspace ops', 'Client billing pass-through'],
};

const money = (cents) => `$${(cents / 100).toFixed(0)}`;

export default function BillingSettingsPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [interval, setBillingInterval] = useState('monthly');
  const [busyPlan, setBusyPlan] = useState('');

  useEffect(() => { getBillingStatus().then(setStatus).catch((e) => setError(e.message)); }, []);

  if (error && !status) return <p className="text-red-400">{error}</p>;
  if (!status) return <p className="text-zinc-300">Loading…</p>;

  const sub = status.subscription;
  const subscribed = sub && (sub.status === 'active' || sub.status === 'trialing');
  const trialDaysLeft = status.trialEndsAt ? Math.max(0, Math.ceil((status.trialEndsAt - Date.now()) / 86400000)) : null;

  const subscribe = async (planId) => {
    setBusyPlan(planId); setError('');
    try {
      const { url } = await startCheckout(planId, interval);
      window.location.href = url;
    } catch (e) { setError(e.message); setBusyPlan(''); }
  };

  const manage = async () => {
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Billing</h1>

      <GlassPanel className="p-5 mb-5">
        <div className="flex items-start gap-4">
          <CreditCard className="w-6 h-6 text-glass-sky mt-1" />
          <div className="flex-1">
            <div className="text-sm text-zinc-400">Current plan</div>
            <div className="text-xl font-semibold text-zinc-100 capitalize flex items-center gap-2">
              {status.plan}
              {subscribed && <Badge tone="published">active</Badge>}
              {!subscribed && trialDaysLeft !== null && (
                <Badge tone={trialDaysLeft > 3 ? 'default' : 'draft'}>
                  {trialDaysLeft > 0 ? `trial · ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left` : 'trial ended'}
                </Badge>
              )}
            </div>
            {subscribed && sub.current_period_end && (
              <div className="text-xs text-zinc-500 mt-1">Renews {new Date(sub.current_period_end).toLocaleDateString()}</div>
            )}
          </div>
          {subscribed && (
            <GlassButton variant="secondary" onClick={manage}>Manage billing</GlassButton>
          )}
        </div>
      </GlassPanel>

      <div className="flex items-center gap-1 mb-4 p-0.5 rounded-lg bg-white/5 border border-white/10 w-fit">
        {['monthly', 'annual'].map((i) => (
          <button
            key={i}
            onClick={() => setBillingInterval(i)}
            className={`text-xs px-3 py-1.5 rounded-md transition ${interval === i ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {i === 'monthly' ? 'Monthly' : 'Annual (2 months free)'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {status.plans.map((p) => {
          const isCurrent = subscribed && sub.plan === p.id;
          return (
            <GlassPanel key={p.id} className={`p-5 flex flex-col ${p.id === 'pro' ? 'border-glass-indigo/50' : ''}`}>
              <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">{p.label}</div>
              <div className="text-2xl font-bold text-zinc-100 mt-1">
                {money(interval === 'annual' ? Math.round(p.annual / 12) : p.monthly)}
                <span className="text-sm font-normal text-zinc-500">/mo</span>
              </div>
              {interval === 'annual' && <div className="text-[11px] text-zinc-500">{money(p.annual)} billed yearly</div>}
              <ul className="text-xs text-zinc-400 space-y-1.5 my-4 flex-1">
                {(PLAN_BLURBS[p.id] || []).map((b) => <li key={b}>✓ {b}</li>)}
              </ul>
              <GlassButton
                variant={p.id === 'pro' ? 'primary' : 'secondary'}
                onClick={() => subscribe(p.id)}
                disabled={!!busyPlan || isCurrent}
                className="w-full justify-center"
              >
                {isCurrent ? 'Current plan' : busyPlan === p.id ? 'Redirecting…' : 'Subscribe'}
              </GlassButton>
            </GlassPanel>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      <p className="text-[11px] text-zinc-500 mt-4">
        Payments are handled by Stripe. You can change or cancel your plan anytime from Manage billing.
      </p>
    </div>
  );
}
