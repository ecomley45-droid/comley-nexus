import { useEffect, useState } from 'react';
import { listOrgs, updateOrg, getOrgUsage } from '../../lib/api.js';
import { GlassPanel, GlassSelect } from '../../lib/ui/Glass.jsx';

// Platform-wide billing overview: every client workspace's plan, usage,
// and a suggested-plan nudge in one place. Self-serve Stripe billing isn't
// wired up yet (same "coming soon" state as the per-org BillingSettingsPage)
// — this is the operator's view for now, not a client-facing one.
//
// Usage is a counts proxy, not real bandwidth metering (nothing in this
// app tracks request/response bytes) -- storage is real (media.size per
// file), page count and 30-day activity stand in for traffic volume. See
// storage.usageForOrg in lib/storage.js.

const PLANS = ['starter', 'growth', 'enterprise', 'internal'];
const PLAN_LABEL = {
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
  internal: 'Internal (comped)',
};

// Simple, deliberately conservative thresholds: only ever suggests moving
// up a tier, never down -- a nudge, not an automatic charge.
function suggestedPlan(usage, currentPlan) {
  if (!usage || currentPlan === 'enterprise' || currentPlan === 'internal') return null;
  const overStarter = usage.storageBytes > 500 * 1024 * 1024 || usage.pageCount > 30 || usage.activityCount > 500;
  if (currentPlan === 'starter' && overStarter) return 'growth';
  const overGrowth = usage.storageBytes > 5 * 1024 * 1024 * 1024 || usage.pageCount > 200 || usage.activityCount > 3000;
  if (currentPlan === 'growth' && overGrowth) return 'enterprise';
  return null;
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function BillingPage() {
  const [orgs, setOrgs] = useState(null);
  const [usage, setUsage] = useState({});
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const refresh = () => {
    listOrgs().then((data) => {
      setOrgs(data);
      data.forEach((org) => {
        getOrgUsage(org.id).then((u) => setUsage((s) => ({ ...s, [org.id]: u }))).catch(() => {});
      });
    }).catch((e) => setError(e.message));
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
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">Billing</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Every client workspace's plan and usage, across the whole platform.
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
        <GlassPanel className="p-2 overflow-x-auto">
          <table className="w-full min-w-lg text-sm border-collapse">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-white/10">
                <th className="py-2 px-2 font-normal">Workspace</th>
                <th className="font-normal">Plan</th>
                <th className="font-normal">Usage (30d)</th>
                <th className="font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const u = usage[org.id];
                const suggestion = suggestedPlan(u, org.plan);
                return (
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
                      {suggestion && (
                        <div className="text-[11px] text-amber-400 mt-1">
                          Usage suggests {PLAN_LABEL[suggestion]}{' '}
                          <button onClick={() => changePlan(org, suggestion)} className="underline hover:text-amber-300">Apply</button>
                        </div>
                      )}
                    </td>
                    <td className="text-zinc-400 text-xs">
                      {u ? (
                        <>
                          <div>{formatBytes(u.storageBytes)} storage</div>
                          <div>{u.pageCount} pages · {u.activityCount} actions</div>
                        </>
                      ) : '…'}
                    </td>
                    <td className="text-zinc-500">{new Date(org.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GlassPanel>
      )}

      <p className="text-xs text-zinc-500 mt-4">
        Self-serve Stripe billing isn't wired up yet — plan changes here are
        immediate and don't generate invoices. Usage is a proxy (storage,
        page count, 30-day activity), not measured bandwidth.
      </p>
    </div>
  );
}
