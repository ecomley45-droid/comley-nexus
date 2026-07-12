import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getOrder, setOrderStatus } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../../cms/lib/ui/Glass.jsx';
import { useCommerceBase } from '../../lib/useCommerceBase.js';

const STATUS_TONE = { paid: 'published', pending: 'default', refunded: 'draft', cancelled: 'draft' };

export default function OrderDetailPage() {
  const base = useCommerceBase();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const load = () => getOrder(id).then(setOrder).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const changeStatus = async (status) => {
    setUpdating(true);
    try {
      await setOrderStatus(id, status);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!order) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <Link to={`${base}/orders`} className="text-sm text-zinc-400 hover:text-white">← Orders</Link>
      <div className="flex justify-between items-start mt-2 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-zinc-500 text-sm">{new Date(order.created_at).toLocaleString()}</p>
        </div>
        <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
      </div>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-2 text-zinc-300">Customer</h2>
        <p className="text-zinc-100">{order.customer_email || 'Guest checkout'}</p>
        {order.campaign_code && <p className="text-zinc-500 text-sm mt-1">Discount code: {order.campaign_code}</p>}
        <div className="text-zinc-500 text-sm mt-2 flex flex-wrap gap-x-4">
          <span>Channel: {order.channel === 'manual' ? 'In-store' : 'Online'}</span>
          {order.sold_by && <span>Sold by: <span className="text-zinc-300">{order.sold_by}</span></span>}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-2 text-zinc-300">Items</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-lg text-sm">
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={idx} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-zinc-100">{item.name} × {item.quantity}</td>
                <td className="text-right text-zinc-300">${(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="flex justify-between mt-3 pt-3 border-t border-white/10 font-semibold text-zinc-100">
          <span>Total</span>
          <span>${order.total.toFixed(2)}</span>
        </div>
      </GlassPanel>

      <div className="flex gap-2">
        {order.status !== 'paid' && <GlassButton disabled={updating} onClick={() => changeStatus('paid')}>Mark paid</GlassButton>}
        {order.status !== 'refunded' && <GlassButton variant="secondary" disabled={updating} onClick={() => changeStatus('refunded')}>Refund</GlassButton>}
        {order.status !== 'cancelled' && <GlassButton variant="danger" disabled={updating} onClick={() => changeStatus('cancelled')}>Cancel</GlassButton>}
      </div>
    </div>
  );
}
