import { useEffect, useState } from 'react';
import { listOrders } from '../../lib/api.js';
import { ORDER_STATUSES, revenueByStatus, netRevenue } from '../../lib/metrics.js';
import { GlassPanel } from '../../../cms/lib/ui/Glass.jsx';

const STATUS_LABEL = { paid: 'Paid', pending: 'Pending', refunded: 'Refunded', cancelled: 'Cancelled' };

function StatTile({ label, value }) {
  return (
    <GlassPanel className="p-4">
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-400 mt-1">{label}</div>
    </GlassPanel>
  );
}

export default function FinancePage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { listOrders().then(setOrders).catch((e) => setError(e.message)); }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!orders) return <p className="text-zinc-400">Loading…</p>;

  const totals = revenueByStatus(orders);
  const net = netRevenue(orders);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Finance</h1>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatTile label="Net revenue (paid − refunded)" value={`$${net.toFixed(2)}`} />
        <StatTile label="Pending" value={`$${totals.pending.toFixed(2)}`} />
      </div>

      <GlassPanel className="p-4">
        <h2 className="font-medium mb-3 text-zinc-300">Revenue by status</h2>
        <table className="w-full text-sm">
          <tbody>
            {ORDER_STATUSES.map((s) => (
              <tr key={s} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-zinc-300">{STATUS_LABEL[s]}</td>
                <td className="text-right text-zinc-100">${totals[s].toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
