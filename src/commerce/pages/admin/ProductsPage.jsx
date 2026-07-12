import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProducts, deleteProduct } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../../cms/lib/ui/Glass.jsx';
import { useCommerceBase } from '../../lib/useCommerceBase.js';

export default function ProductsPage() {
  const base = useCommerceBase();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  const load = () => listProducts().then(setProducts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!confirm('Delete this product?')) return;
    await deleteProduct(id);
    load();
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!products) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link to={`${base}/products/new`}><GlassButton>New product</GlassButton></Link>
      </div>
      {products.length === 0 && <p className="text-zinc-500">No products yet.</p>}
      <GlassPanel className="p-2">
        <div className="overflow-x-auto"><table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Name</th>
              <th className="font-normal">SKU</th>
              <th className="font-normal">Price</th>
              <th className="font-normal">Inventory</th>
              <th className="font-normal">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-2">
                  <Link to={`${base}/products/${p.id}`} className="text-glass-sky hover:underline">{p.name}</Link>
                </td>
                <td className="text-zinc-400">{p.sku}</td>
                <td className="text-zinc-100">${Number(p.price).toFixed(2)}</td>
                <td className="text-zinc-400">{p.inventory}</td>
                <td><Badge tone={p.status === 'active' ? 'published' : 'draft'}>{p.status}</Badge></td>
                <td className="text-right px-2"><button onClick={() => remove(p.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </GlassPanel>
    </div>
  );
}
