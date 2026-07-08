import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrders, listCustomers, listProducts } from '../../lib/api.js';
import {
  netRevenue, averageOrderValue, ordersPerDay, revenueByStatus, ORDER_STATUSES,
  topProductsByRevenue, lowInventoryProducts,
} from '../../lib/metrics.js';
import { GlassPanel, Badge } from '../../../cms/lib/ui/Glass.jsx';
import { useCommerceBase } from '../../lib/useCommerceBase.js';

const STATUS_TONE = { paid: 'published', pending: 'default', refunded: 'draft', cancelled: 'draft' };
const STATUS_LABEL = { paid: 'Paid', pending: 'Pending', refunded: 'Refunded', cancelled: 'Cancelled' };

function StatTile({ label, value }) {
  return (
    <GlassPanel className="p-4">
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-400 mt-1">{label}</div>
    </GlassPanel>
  );
}

export default function HomePage() {
  const base = useCommerceBase();
  const [orders, setOrders] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listOrders(), listCustomers(), listProducts()])
      .then(([o, c, p]) => { setOrders(o); setCustomers(c); setProducts(p); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!orders || !customers || !products) return <p className="text-zinc-400">Loading…</p>;

  const net = netRevenue(orders);
  const aov = averageOrderValue(orders);
  const daily = ordersPerDay(orders);
  const maxCount = Math.max(1, ...daily.map((d) => d.count));
  const totals = revenueByStatus(orders);
  const topProducts = topProductsByRevenue(orders, 5);
  const maxRevenue = Math.max(1, ...topProducts.map(([, rev]) => rev));
  const lowStock = lowInventoryProducts(products);
  const recent = orders.slice(0, 5);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Home</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatTile label="Net revenue" value={`$${net.toFixed(2)}`} />
        <StatTile label="Orders" value={orders.length} />
        <StatTile label="Customers" value={customers.length} />
        <StatTile label="Average order value" value={`$${aov.toFixed(2)}`} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <GlassPanel className="p-4">
          <h2 className="font-medium mb-3 text-zinc-300">Orders, last 14 days</h2>
          <div className="flex items-end gap-1 h-24">
            {daily.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end" title={`${d.day}: ${d.count}`}>
                <div
                  className="w-full rounded-t bg-glass-indigo/70"
                  style={{ height: `${Math.max(3, (d.count / maxCount) * 72)}px` }}
                />
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <h2 className="font-medium mb-3 text-zinc-300">Revenue by status</h2>
          <table className="w-full text-sm">
            <tbody>
              {ORDER_STATUSES.map((s) => (
                <tr key={s} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 text-zinc-300">{STATUS_LABEL[s]}</td>
                  <td className="text-right text-zinc-100">${totals[s].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <GlassPanel className="p-4">
          <h2 className="font-medium mb-3 text-zinc-300">Top products</h2>
          {topProducts.length === 0 && <p className="text-zinc-500 text-sm">No paid orders yet.</p>}
          <div className="space-y-2">
            {topProducts.map(([name, revenue]) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-200">{name}</span>
                  <span className="text-zinc-400">${revenue.toFixed(2)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-glass-sky/70" style={{ width: `${(revenue / maxRevenue) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <h2 className="font-medium mb-3 text-zinc-300">Low inventory</h2>
          {lowStock.length === 0 && <p className="text-zinc-500 text-sm">Nothing running low.</p>}
          {lowStock.map((p) => (
            <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
              <Link to={`${base}/products/${p.id}`} className="text-zinc-200 hover:text-glass-sky">{p.name}</Link>
              <span className={p.inventory === 0 ? 'text-red-400' : 'text-amber-400'}>{p.inventory} left</span>
            </div>
          ))}
        </GlassPanel>
      </div>

      <h2 className="font-medium mb-2 text-zinc-300">Recent orders</h2>
      <GlassPanel className="p-2">
        {recent.length === 0 && <p className="text-zinc-500 p-2">No orders yet.</p>}
        <table className="w-full text-sm">
          <tbody>
            {recent.map((o) => (
              <tr key={o.id} className="border-b border-white/5 last:border-0">
                <td className="py-2 px-2">
                  <Link to={`${base}/orders/${o.id}`} className="text-glass-sky hover:underline">#{o.id.slice(0, 8)}</Link>
                </td>
                <td className="text-zinc-400">{o.customer_email || 'guest'}</td>
                <td className="text-zinc-100">${o.total.toFixed(2)}</td>
                <td className="text-right px-2"><Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
