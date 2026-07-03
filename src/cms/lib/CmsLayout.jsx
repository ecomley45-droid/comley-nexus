import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getPages } from './api.js';
import { GlassShell } from './ui/Glass.jsx';
import TopBar from './ui/TopBar.jsx';
import FeedbackWidget from './FeedbackWidget.jsx';
import AuthTokenBridge from './AuthTokenBridge.jsx';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/pages', label: 'Pages' },
  { to: '/admin/library', label: 'Library' },
  { to: '/admin/media', label: 'Media' },
  { to: '/admin/redirects', label: 'Redirects' },
  { to: '/admin/comments', label: 'Comments' },
  { to: '/admin/import-export', label: 'Import / Export' },
  {
    to: '/admin/ops/dashboard',
    label: 'Ops',
    children: [
      { to: '/admin/ops/dashboard', label: 'Dashboard', end: true },
      { to: '/admin/feedback', label: 'Feedback' },
      { to: '/admin/ops/system-status', label: 'System Status' },
      { to: '/admin/ops/feature-requests', label: 'Feature Requests' },
      { to: '/admin/ops/schedule', label: 'Schedule' },
      { to: '/admin/ops/git-pull', label: 'Git Pull' },
      { to: '/admin/ops/profile', label: 'Profile' },
    ],
  },
  {
    to: '/admin/settings',
    label: 'Settings',
    children: [
      { to: '/admin/settings', label: 'General', end: true },
      { to: '/admin/connections', label: 'Connections' },
      { to: '/admin/team', label: 'Team & Permissions' },
      { to: '/admin/audit', label: 'Audit Log' },
    ],
  },
];

export default function CmsLayout() {
  const [pages, setPages] = useState([]);

  useEffect(() => { getPages().then((d) => setPages(d.pages)).catch(() => {}); }, []);

  return (
    <GlassShell>
      <AuthTokenBridge />
      <TopBar
        logoTo="/admin"
        logoLabel="Nexus CMS"
        navItems={NAV_ITEMS}
        extraNavItem={{ to: '/admin/commerce', label: 'Commerce dashboard →' }}
        searchItems={pages.map((p) => ({ label: p.name, to: `/admin/pages/${p.id}` }))}
        searchPlaceholder="Search pages…"
      />
      <main className="p-6">
        <Outlet />
      </main>
      <FeedbackWidget area="cms" />
    </GlassShell>
  );
}
