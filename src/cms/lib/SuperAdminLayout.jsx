import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getNexusPages } from './api.js';
import { GlassShell } from './ui/Glass.jsx';
import TopBar from './ui/TopBar.jsx';
import AuthTokenBridge from './AuthTokenBridge.jsx';

// Top-level chrome for /super-admin/*, sibling to CmsLayout's /:orgSlug/*
// tree — not nested under it. This is where the platform is operated:
// managing every client org and editing Nexus's own site pages. Gated by
// RequireSuperAdmin (ADMIN_EMAILS), independent of any org membership.
const NAV_ITEMS = [
  { to: '/super-admin', label: 'Dashboard', end: true },
  { to: '/super-admin/orgs', label: 'Client workspaces' },
  { to: '/super-admin/pages', label: 'Nexus pages' },
  { to: '/super-admin/blocks', label: 'Blocks' },
  { to: '/super-admin/billing', label: 'Billing' },
  { to: '/super-admin/settings', label: 'Nexus settings' },
];

export default function SuperAdminLayout() {
  const [pages, setPages] = useState([]);

  useEffect(() => { getNexusPages().then((d) => setPages(d.pages)).catch(() => {}); }, []);

  return (
    <GlassShell>
      <AuthTokenBridge />
      <TopBar
        logoTo="/super-admin"
        logoLabel="Nexus Super Admin"
        navItems={NAV_ITEMS}
        searchItems={pages.map((p) => ({ label: p.name, to: `/super-admin/pages/${p.id}` }))}
        searchPlaceholder="Search Nexus pages…"
      />
      <main className="p-6">
        <Outlet />
      </main>
    </GlassShell>
  );
}
