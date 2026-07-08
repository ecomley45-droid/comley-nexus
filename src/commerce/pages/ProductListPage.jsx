import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProducts, searchProducts } from '../lib/api.js';
import { GlassShell, GlassPanel, GlassButton, GlassInput } from '../../cms/lib/ui/Glass.jsx';
import { useCommerceBase } from '../lib/useCommerceBase.js';

export default function ProductListPage() {
  const base = useCommerceBase();
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listProducts().then(setProducts).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const runSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return listProducts().then(setProducts);
    const { results } = await searchProducts(query);
    setProducts(results);
  };

  return (
    <GlassShell>
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Shop</h1>
        <form onSubmit={runSearch} className="mb-6 flex gap-2">
          <GlassInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="flex-1"
          />
          <GlassButton type="submit">Search</GlassButton>
        </form>

        {loading && <p className="text-zinc-400">Loading…</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!loading && products.length === 0 && (
          <p className="text-zinc-500">
            No products yet. Add one via <code>POST /api/commerce/products</code> or the{' '}
            <Link className="underline text-glass-sky" to={`${base}`}>admin panel</Link>.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {products.map((p) => (
            <Link key={p.id} to={`/shop/${p.id}`}>
              <GlassPanel className="p-4 hover:bg-white/10 transition">
                <div className="font-medium text-zinc-100">{p.name}</div>
                <div className="text-sm text-zinc-500">{p.sku}</div>
                <div className="mt-2 font-semibold text-glass-sky">${Number(p.price).toFixed(2)}</div>
              </GlassPanel>
            </Link>
          ))}
        </div>
      </div>
    </GlassShell>
  );
}
