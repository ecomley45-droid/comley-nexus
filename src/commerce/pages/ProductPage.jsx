import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProduct, addToCart, searchProducts } from '../lib/api.js';
import { track } from '../lib/posthogClient.js';
import { useCommerceUser } from '../lib/useCommerceUser.js';
import { GlassShell, GlassPanel, GlassButton } from '../../cms/lib/ui/Glass.jsx';

export default function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [alsoViewed, setAlsoViewed] = useState([]);
  const [error, setError] = useState('');
  const { tier } = useCommerceUser();

  useEffect(() => {
    getProduct(id)
      .then((p) => {
        setProduct(p);
        track('product_viewed', { product_id: p.id, name: p.name, tier });
        return searchProducts(p.name).then(({ alsoViewed }) => setAlsoViewed(alsoViewed || []));
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <GlassShell><p className="p-6 text-red-400">{error}</p></GlassShell>;
  if (!product) return <GlassShell><p className="p-6 text-zinc-400">Loading…</p></GlassShell>;

  const price = tier === 'wholesaler' && product.wholesale_price ? product.wholesale_price : product.price;

  const handleAddToCart = async () => {
    await addToCart({ productId: product.id, quantity: 1, name: product.name, price });
    track('added_to_cart', { product_id: product.id, price, tier });
    navigate('/cart');
  };

  return (
    <GlassShell>
      <div className="max-w-3xl mx-auto p-6">
        <GlassPanel className="p-6">
          <h1 className="text-2xl font-semibold text-zinc-100">{product.name}</h1>
          <p className="text-zinc-500">{product.sku}</p>
          <p className="mt-4 text-zinc-300">{product.description}</p>
          <div className="mt-4 text-xl font-semibold text-glass-sky">
            ${Number(price).toFixed(2)}
            {tier === 'wholesaler' && product.wholesale_price && (
              <span className="ml-2 text-sm text-emerald-400">wholesale price</span>
            )}
          </div>
          <GlassButton onClick={handleAddToCart} className="mt-4">Add to cart</GlassButton>
        </GlassPanel>

        {alsoViewed.length > 0 && (
          <div className="mt-8">
            <h2 className="font-medium mb-2 text-zinc-300">Customers also viewed</h2>
            <div className="flex gap-4 overflow-x-auto">
              {alsoViewed.map((p) => (
                <GlassPanel key={p.id} className="p-3 min-w-40 text-zinc-200">
                  {p.name}
                </GlassPanel>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassShell>
  );
}
