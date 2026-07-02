import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { listProducts } from '../lib/api.js';
import { GlassShell } from '../../cms/lib/ui/Glass.jsx';
import TopBar from '../../cms/lib/ui/TopBar.jsx';
import FeedbackWidget from '../../cms/lib/FeedbackWidget.jsx';

const NAV_ITEMS = [
  { to: '/admin/commerce', label: 'Home', end: true },
  { to: '/admin/commerce/orders', label: 'Orders' },
  { to: '/admin/commerce/products', label: 'Products' },
  { to: '/admin/commerce/customers', label: 'Customers' },
  { to: '/admin/commerce/growth', label: 'Growth' },
  { to: '/admin/commerce/discounts', label: 'Discounts' },
  { to: '/admin/commerce/content', label: 'Content' },
  { to: '/admin/commerce/markets', label: 'Markets' },
  { to: '/admin/commerce/finance', label: 'Finance' },
  { to: '/admin/commerce/analytics', label: 'Analytics' },
];

export default function CommerceLayout() {
  const [products, setProducts] = useState([]);

  useEffect(() => { listProducts().then(setProducts).catch(() => {}); }, []);

  return (
    <GlassShell>
      <TopBar
        logoTo="/admin/commerce"
        logoLabel="Nexus Commerce"
        navItems={NAV_ITEMS}
        extraNavItem={{ to: '/admin', label: '← Back to CMS' }}
        searchItems={products.map((p) => ({ label: p.name, to: `/admin/commerce/products/${p.id}` }))}
        searchPlaceholder="Search products…"
      />
      <main className="p-6">
        <Outlet />
      </main>
      <FeedbackWidget area="commerce" />
    </GlassShell>
  );
}
