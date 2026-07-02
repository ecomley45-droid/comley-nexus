import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCart } from '../lib/api.js';
import { track } from '../lib/posthogClient.js';
import { GlassShell, GlassPanel, GlassButton } from '../../cms/lib/ui/Glass.jsx';

export default function CartPage() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getCart().then((c) => setItems(c.items));
  }, []);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const goToCheckout = () => {
    track('checkout_started', { item_count: items.length, total });
    navigate('/checkout');
  };

  return (
    <GlassShell>
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Your cart</h1>
        <GlassPanel className="p-4">
          {items.length === 0 && <p className="text-zinc-500">Your cart is empty.</p>}
          <ul className="divide-y divide-white/10">
            {items.map((item, idx) => (
              <li key={idx} className="py-3 flex justify-between text-zinc-200">
                <span>{item.name} × {item.quantity}</span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {items.length > 0 && (
            <>
              <div className="mt-4 flex justify-between font-semibold text-zinc-100">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <GlassButton onClick={goToCheckout} className="mt-4 w-full">Checkout</GlassButton>
            </>
          )}
        </GlassPanel>
      </div>
    </GlassShell>
  );
}
