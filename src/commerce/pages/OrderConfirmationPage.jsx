import { Link } from 'react-router-dom';
import { GlassShell, GlassPanel, GlassButton } from '../../cms/lib/ui/Glass.jsx';

// Stripe's embedded checkout redirects here (return_url) after a real
// payment completes; the order itself is created by the payment_intent.succeeded
// webhook, not by this page, since webhooks are the source of truth for payment state.
export default function OrderConfirmationPage() {
  return (
    <GlassShell>
      <div className="max-w-xl mx-auto p-6">
        <GlassPanel className="p-8 text-center">
          <h1 className="text-2xl font-semibold mb-2 text-zinc-100">Thanks for your order!</h1>
          <p className="text-zinc-400 mb-4">You'll receive a confirmation email shortly.</p>
          <Link to="/shop">
            <GlassButton>Continue shopping</GlassButton>
          </Link>
        </GlassPanel>
      </div>
    </GlassShell>
  );
}
