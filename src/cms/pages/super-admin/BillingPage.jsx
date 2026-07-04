import { useEffect, useState } from 'react';
import { listOrgs, updateOrg } from '../../lib/api.js';
import { GlassPanel, GlassSelect } from '../../lib/ui/Glass.jsx';

// Platform-wide billing overview: every client workspace's plan in one
// place. Self-serve Stripe billing isn't wired up yet (same "coming soon"
// state as the per-org BillingSettingsPage) — this is the operator's view
// for now, not a client-facing one.

const PLANS = ['starter', 'growth', 'enterprise', 'internal'];
const PLAN_LABEL = {
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
  internal: 'Internal (comped)',
};

export default function BillingPage() {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const refresh = () => {
    listOrgs().then(setOrgs).catch((e) => setError(e.message));
  };
  useEffect(refresh, []);

  const changePlan = async (org, plan) => {
    setBusyId(org.id);
    try {
      await updateOrg(org.id, { plan });
      refresh();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const counts = (orgs || []).reduce((acc, o) => {
    acc[o.plan] = (acc[o.plan] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">Billing</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Every client workspace's plan, across the whole platform.
      </p>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {PLANS.map((plan) => (
          <GlassPanel key={plan} className="p-4">
            <div className="text-xs text-zinc-500">{PLAN_LABEL[plan]}</div>
            <div className="text-2xl font-semibold text-zinc-100">{counts[plan] || 0}</div>
          </GlassPanel>
        ))}
      </div>

      {orgs === null && <p className="text-sm text-zinc-400">Loading…</p>}

      {orgs && (
        <GlassPanel className="p-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-white/10">
                <th className="py-2 px-2 font-normal">Workspace</th>
                <th className="font-normal">Plan</th>
                <th className="font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-white/5">
                  <td className="py-2 px-2">
                    <div className="text-zinc-100">{org.name}</div>
                    <div className="text-xs text-zinc-500">/{org.id}</div>
                  </td>
                  <td>
                    <GlassSelect
                      value={org.plan}
                      onChange={(e) => changePlan(org, e.target.value)}
                      disabled={busyId === org.id}
                      className="text-xs py-1"
                    >
                      {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                    </GlassSelect>
                  </td>
                  <td className="text-zinc-500">{new Date(org.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}

      <p className="text-xs text-zinc-500 mt-4">
        Self-serve Stripe billing isn't wired up yet — plan changes here are
        immediate and don't generate invoices.
      </p>
    </div>
  );
}
