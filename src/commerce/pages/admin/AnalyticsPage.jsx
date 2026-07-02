import { useEffect, useState } from 'react';
import { listOrders, listCustomers } from '../../lib/api.js';
import { topProductsByRevenue, purchasesByTier } from '../../lib/metrics.js';
import { GlassPanel } from '../../../cms/lib/ui/Glass.jsx';

export default function AnalyticsPage() {
  const [orders, setOrders] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listOrders(), listCustomers()])
      .then(([o, c]) => { setOrders(o); setCustomers(c); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!orders || !customers) return <p className="text-zinc-400">Loading…</p>;

  const topProducts = topProductsByRevenue(orders);
  const maxRevenue = Math.max(1, ...topProducts.map(([, rev]) => rev));
  const tiers = purchasesByTier(orders, customers);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Analytics</h1>

      <GlassPanel className="p-4 mb-6">
        <h2 className="font-medium mb-3 text-zinc-300">Top products by revenue</h2>
        {topProducts.length === 0 && <p className="text-zinc-500 text-sm">No paid orders yet.</p>}
        <div className="space-y-2">
          {topProducts.map(([name, revenue]) => (
            <div key={name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-200">{name}</span>
                <span className="text-zinc-400">${revenue.toFixed(2)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5">
                <div className="h-full rounded-full bg-glass-sky/70" style={{ width: `${(revenue / maxRevenue) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="font-medium mb-3 text-zinc-300">Purchases by customer tier</h2>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(tiers).map(([tier, count]) => (
            <div key={tier} className="text-center">
              <div className="text-xl font-semibold text-zinc-100">{count}</div>
              <div className="text-xs text-zinc-500 capitalize mt-1">{tier}</div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
