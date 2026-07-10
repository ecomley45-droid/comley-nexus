import { Outlet, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { listProducts } from '../lib/api.js';
import { getMe } from '../../cms/lib/api.js';
import { GlassShell } from '../../cms/lib/ui/Glass.jsx';
import AppShell from '../../cms/lib/ui/AppShell.jsx';
import FeedbackWidget from '../../cms/lib/FeedbackWidget.jsx';
import AuthTokenBridge from '../../cms/lib/AuthTokenBridge.jsx';

const SECTIONS = [
  { path: '', label: 'Home', end: true },
  { path: '/orders', label: 'Orders' },
  { path: '/products', label: 'Products' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/locations', label: 'Locations' },
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
  const [orgName, setOrgName] = useState('');

  useEffect(() => { listProducts().then(setProducts).catch(() => {}); }, []);
  useEffect(() => { getMe().then((m) => setOrgName(m?.org?.name || '')).catch(() => {}); }, []);

  const navItems = useMemo(() => SECTIONS.map((s) => ({ to: `${base}${s.path}`, label: s.label, end: s.end })), [base]);
  // Show the workspace's own name (falls back to a title-cased slug before
  // /me loads), so the store isn't generically branded "Nexus Commerce".
  const displayName = orgName || (orgSlug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const logoLabel = displayName ? `${displayName} · Store` : 'Store';

  return (
    <GlassShell>
      <AuthTokenBridge />
      <AppShell
        logoTo={base}
        logoLabel={logoLabel}
        navItems={navItems}
        extraNavItem={{ to: `/${orgSlug}`, label: '← Back to CMS' }}
        searchItems={products.map((p) => ({ label: p.name, to: `${base}/products/${p.id}` }))}
        searchPlaceholder="Search products…"
      >
        <Outlet />
      </AppShell>
      <FeedbackWidget area="commerce" />
    </GlassShell>
  );
}
