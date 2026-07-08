import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrders } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../../cms/lib/ui/Glass.jsx';
import { useCommerceBase } from '../../lib/useCommerceBase.js';
import ManualSaleModal from './ManualSaleModal.jsx';

const STATUS_TONE = { paid: 'published', pending: 'default', refunded: 'draft', cancelled: 'draft' };

export default function OrdersPage() {
  const base = useCommerceBase();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [saleOpen, setSaleOpen] = useState(false);

  const load = () => listOrders().then(setOrders).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!orders) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <GlassButton onClick={() => setSaleOpen(true)}>New sale</GlassButton>
      </div>
      {orders.length === 0 && <p className="text-zinc-500">No orders yet. Record a walk-in with “New sale”.</p>}
      <GlassPanel className="p-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Order</th>
              <th className="font-normal">Customer</th>
              <th className="font-normal">Items</th>
              <th className="font-normal">Total</th>
              <th className="font-normal">Sold by</th>
              <th className="font-normal">Channel</th>
              <th className="font-normal">Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-2">
                  <Link to={`${base}/orders/${o.id}`} className="text-glass-sky hover:underline">#{o.id.slice(0, 8)}</Link>
                </td>
                <td className="text-zinc-300">{o.customer_email || 'guest'}</td>
                <td className="text-zinc-400">{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                <td className="text-zinc-100">${o.total.toFixed(2)}</td>
                <td className="text-zinc-300">{o.sold_by || '—'}</td>
                <td className="text-zinc-500">{o.channel === 'manual' ? 'In-store' : 'Online'}</td>
                <td className="text-zinc-500">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="text-right px-2"><Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>

      {saleOpen && <ManualSaleModal onClose={() => setSaleOpen(false)} onCreated={() => { setSaleOpen(false); load(); }} />}
    </div>
  );
}
