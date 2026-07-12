import { useEffect, useState } from 'react';
import { listOrders, listCampaigns } from '../../lib/api.js';
import { ordersPerDay, attributedCampaigns } from '../../lib/metrics.js';
import { GlassPanel } from '../../../cms/lib/ui/Glass.jsx';

export default function GrowthPage() {
  const [orders, setOrders] = useState(null);
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listOrders(), listCampaigns()])
      .then(([o, c]) => { setOrders(o); setCampaigns(c); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!orders || !campaigns) return <p className="text-zinc-400">Loading…</p>;

  const daily = ordersPerDay(orders);
  const maxCount = Math.max(1, ...daily.map((d) => d.count));
  const attributed = attributedCampaigns(campaigns);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Growth</h1>

      <GlassPanel className="p-4 mb-6">
        <h2 className="font-medium mb-3 text-zinc-300">Orders, last 14 days</h2>
        <div className="flex items-end gap-1.5 h-32">
          {daily.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.day}: ${d.count}`}>
              {d.count > 0 && <span className="text-[10px] text-zinc-400">{d.count}</span>}
              <div
                className="w-full rounded-t bg-glass-indigo/70"
                style={{ height: `${Math.max(4, (d.count / maxCount) * 96)}px` }}
              />
            </div>
          ))}
        </div>
      </GlassPanel>

      <h2 className="font-medium mb-2 text-zinc-300">Discount code performance</h2>
      {attributed.length === 0 && <p className="text-zinc-500">No discount codes have been used yet.</p>}
      {attributed.length > 0 && (
        <GlassPanel className="p-2">
          <div className="overflow-x-auto"><table className="w-full min-w-lg text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-white/10">
                <th className="py-2 px-2 font-normal">Code</th>
                <th className="font-normal">Uses</th>
                <th className="font-normal">Revenue attributed</th>
              </tr>
            </thead>
            <tbody>
              {attributed.map((c) => (
                <tr key={c.code} className="border-b border-white/5 last:border-0">
                  <td className="py-2 px-2 font-mono text-zinc-100">{c.code}</td>
                  <td className="text-zinc-400">{c.usage_count}</td>
                  <td className="text-zinc-300">${Number(c.revenue_attributed).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </GlassPanel>
      )}
    </div>
  );
}
