import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProducts, deleteProduct } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../../cms/lib/ui/Glass.jsx';
import EmptyState from '../../../cms/lib/ui/EmptyState.jsx';
import { useConfirm } from '../../../cms/lib/ui/useConfirm.jsx';
import { Package, Plus } from 'lucide-react';
import { useCommerceBase } from '../../lib/useCommerceBase.js';

export default function ProductsPage() {
  const base = useCommerceBase();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [confirm, confirmUi] = useConfirm();

  const load = () => listProducts().then(setProducts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const remove = async (product) => {
    const ok = await confirm({
      title: `Delete “${product.name}”?`,
      body: 'Past orders keep their record of it, but any Product block on your site pointing at it stops working.',
      confirmLabel: 'Delete product',
    });
    if (!ok) return;
    await deleteProduct(product.id);
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
      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          action={{ label: 'Add your first product', icon: Plus, to: `${base}/products/new` }}
        >
          Add what you sell here, then drop a Product block on any page to take payment for it.
        </EmptyState>
      ) : (
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
                <td className="text-right px-2"><button onClick={() => remove(p)} className="text-red-400 hover:text-red-300 text-xs">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </GlassPanel>
      )}
      {confirmUi}
    </div>
  );
}
