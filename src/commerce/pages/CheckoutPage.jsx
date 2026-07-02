import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { startCheckout, simulatePayment } from '../lib/api.js';
import { stripePromise, stripeConfigured } from '../lib/stripeClient.js';
import { GlassShell, GlassPanel, GlassButton } from '../../cms/lib/ui/Glass.jsx';

export default function CheckoutPage() {
  const [clientSecret, setClientSecret] = useState(null);
  const [localMode, setLocalMode] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    startCheckout()
      .then((res) => {
        if (res.localMode) {
          setLocalMode(true);
        } else {
          setClientSecret(res.clientSecret);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const runSimulatedPayment = async () => {
    setSimulating(true);
    try {
      const { order } = await simulatePayment();
      setOrder(order);
    } catch (e) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  };

  if (error) return <GlassShell><p className="p-6 text-red-400">{error}</p></GlassShell>;

  if (order) {
    return (
      <GlassShell>
        <div className="max-w-xl mx-auto p-6">
          <GlassPanel className="p-8 text-center">
            <h1 className="text-2xl font-semibold mb-2 text-zinc-100">Order placed!</h1>
            <p className="text-zinc-400 mb-4">Order #{order.id.slice(0, 8)} — ${order.total.toFixed(2)}</p>
            <p className="text-sm text-zinc-500 mb-4">
              A confirmation email was written to <code>data/commerce/emails/</code> (Resend isn't configured yet).
            </p>
            <GlassButton onClick={() => navigate('/shop')}>Continue shopping</GlassButton>
          </GlassPanel>
        </div>
      </GlassShell>
    );
  }

  if (localMode || !stripeConfigured) {
    return (
      <GlassShell>
        <div className="max-w-xl mx-auto p-6">
          <GlassPanel className="p-6">
            <h1 className="text-2xl font-semibold mb-4 text-zinc-100">Checkout (local dev mode)</h1>
            <p className="text-zinc-400 mb-4">
              Stripe isn't configured yet, so this simulates a successful payment through the same order-fulfillment
              path a real Stripe webhook would trigger — order creation, confirmation email, and PostHog tracking.
            </p>
            <GlassButton onClick={runSimulatedPayment} disabled={simulating}>
              {simulating ? 'Processing…' : 'Simulate payment'}
            </GlassButton>
          </GlassPanel>
        </div>
      </GlassShell>
    );
  }

  if (!clientSecret) return <GlassShell><p className="p-6 text-zinc-400">Loading checkout…</p></GlassShell>;

  return (
    <GlassShell>
      <div className="max-w-2xl mx-auto p-6">
        <GlassPanel className="p-2">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </GlassPanel>
      </div>
    </GlassShell>
  );
}
