import { Outlet, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { listProducts } from '../lib/api.js';
import { GlassShell } from '../../cms/lib/ui/Glass.jsx';
import TopBar from '../../cms/lib/ui/TopBar.jsx';
import FeedbackWidget from '../../cms/lib/FeedbackWidget.jsx';
import AuthTokenBridge from '../../cms/lib/AuthTokenBridge.jsx';

const SECTIONS = [
  { path: '', label: 'Home', end: true },
  { path: '/orders', label: 'Orders' },
  { path: '/products', label: 'Products' },
  { path: '/customers', label: 'Customers' },
  { path: '/growth', label: 'Growth' },
  { path: '/discounts', label: 'Discounts' },
  { path: '/content', label: 'Content' },
  { path: '/markets', label: 'Markets' },
  { path: '/finance', label: 'Finance' },
  { path: '/analytics', label: 'Analytics' },
];

export default function CommerceLayout() {
  const { orgSlug } = useParams();
  const base = `/${orgSlug}/commerce`;
  const [products, setProducts] = useState([]);

  useEffect(() => { listProducts().then(setProducts).catch(() => {}); }, []);

  const navItems = useMemo(() => SECTIONS.map((s) => ({ to: `${base}${s.path}`, label: s.label, end: s.end })), [base]);

  return (
    <GlassShell>
      <AuthTokenBridge />
      <TopBar
        logoTo={base}
        logoLabel="Nexus Commerce"
        navItems={navItems}
        extraNavItem={{ to: `/${orgSlug}`, label: '← Back to CMS' }}
        searchItems={products.map((p) => ({ label: p.name, to: `${base}/products/${p.id}` }))}
        searchPlaceholder="Search products…"
      />
      <main className="p-6">
        <Outlet />
      </main>
      <FeedbackWidget area="commerce" />
    </GlassShell>
  );
}
