import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrders } from '../../lib/api.js';
import { GlassPanel, Badge } from '../../../cms/lib/ui/Glass.jsx';

const STATUS_TONE = { paid: 'published', pending: 'default', refunded: 'draft', cancelled: 'draft' };

export default function OrdersPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { listOrders().then(setOrders).catch((e) => setError(e.message)); }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!orders) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Orders</h1>
      {orders.length === 0 && <p className="text-zinc-500">No orders yet.</p>}
      <GlassPanel className="p-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Order</th>
              <th className="font-normal">Customer</th>
              <th className="font-normal">Items</th>
              <th className="font-normal">Total</th>
              <th className="font-normal">Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-2">
                  <Link to={`/admin/commerce/orders/${o.id}`} className="text-glass-sky hover:underline">#{o.id.slice(0, 8)}</Link>
                </td>
                <td className="text-zinc-300">{o.customer_email || 'guest'}</td>
                <td className="text-zinc-400">{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                <td className="text-zinc-100">${o.total.toFixed(2)}</td>
                <td className="text-zinc-500">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="text-right px-2"><Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
