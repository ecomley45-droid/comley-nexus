import { useEffect, useState } from 'react';
import { listCustomers, setCustomerTier } from '../../lib/api.js';
import { GlassPanel, GlassSelect } from '../../../cms/lib/ui/Glass.jsx';

export default function CustomersPage() {
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState('');

  const load = () => listCustomers().then(setCustomers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const changeTier = async (id, tier) => {
    await setCustomerTier(id, tier);
    load();
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!customers) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Customers</h1>
      {customers.length === 0 && <p className="text-zinc-500">No customers yet — they're created via the Clerk webhook or local dev checkout.</p>}
      <GlassPanel className="p-2">
        <div className="overflow-x-auto"><table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Email</th>
              <th className="font-normal">Lifetime value</th>
              <th className="font-normal">Joined</th>
              <th className="font-normal">Tier</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-2 text-zinc-100">{c.email}</td>
                <td className="text-zinc-300">${Number(c.lifetime_value || 0).toFixed(2)}</td>
                <td className="text-zinc-500">{new Date(c.created_at).toLocaleDateString()}</td>
                <td>
                  <GlassSelect value={c.tier} onChange={(e) => changeTier(c.id, e.target.value)} className="text-xs py-1">
                    <option value="customer">customer</option>
                    <option value="wholesaler">wholesaler</option>
                    <option value="admin">admin</option>
                  </GlassSelect>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </GlassPanel>
    </div>
  );
}
