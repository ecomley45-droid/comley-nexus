import { Outlet, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { getPages, getPreferences } from './api.js';
import { GlassShell } from './ui/Glass.jsx';
import TopBar from './ui/TopBar.jsx';
import FeedbackWidget from './FeedbackWidget.jsx';
import AuthTokenBridge from './AuthTokenBridge.jsx';

// Nav item definitions live as relative paths so they can be rebased onto
// /:orgSlug at render time. That keeps the component agnostic to which
// org is active — for Ethan it's "/admin/*", for future clients it'll be
// "/{their-slug}/*".
const NAV_ITEMS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'pages', label: 'Pages' },
  { to: 'library', label: 'Library' },
  { to: 'media', label: 'Media' },
  { to: 'redirects', label: 'Redirects' },
  { to: 'comments', label: 'Comments' },
  { to: 'import-export', label: 'Import / Export' },
  {
    to: 'ops/dashboard',
    label: 'Ops',
    children: [
      { to: 'ops/dashboard', label: 'Dashboard', end: true },
      { to: 'feedback', label: 'Feedback' },
      { to: 'ops/system-status', label: 'System Status' },
      { to: 'ops/feature-requests', label: 'Feature Requests' },
      { to: 'ops/schedule', label: 'Schedule' },
      { to: 'ops/git-pull', label: 'Git Pull' },
      { to: 'ops/profile', label: 'Profile' },
    ],
  },
  {
    to: 'settings',
    label: 'Settings',
    children: [
      { to: 'settings', label: 'General', end: true },
      { to: 'connections', label: 'Connections' },
      { to: 'team', label: 'Team & Permissions' },
      { to: 'audit', label: 'Audit Log' },
    ],
  },
];

// Rebase every "to" onto the current org slug so <NavLink> gets absolute
// paths. Recurses one level for children menus.
function rebaseNav(items, base) {
  return items.map((item) => {
    const to = item.to === '' ? base : `${base}/${item.to}`;
    const rebased = { ...item, to };
    if (Array.isArray(item.children)) rebased.children = rebaseNav(item.children, base);
    return rebased;
  });
}

export default function CmsLayout() {
  const { orgSlug } = useParams();
  const base = `/${orgSlug}`;
  const [pages, setPages] = useState([]);
  const [commerceEnabled, setCommerceEnabled] = useState(false);

  useEffect(() => { getPages().then((d) => setPages(d.pages)).catch(() => {}); }, []);

  // Commerce is per-org opt-in. The flag lives in the signed-in user's
  // preferences under `integrations.commerce_enabled` — flip it on from
  // Settings (or via the admin API) to unlock the commerce nav item.
  useEffect(() => {
    getPreferences()
      .then((p) => setCommerceEnabled(!!p?.integrations?.commerce_enabled))
      .catch(() => {});
  }, []);

  const navItems = useMemo(() => rebaseNav(NAV_ITEMS, base), [base]);

  return (
    <GlassShell>
      <AuthTokenBridge />
      <TopBar
        logoTo={base}
        logoLabel="Nexus"
        navItems={navItems}
        extraNavItem={commerceEnabled ? { to: `${base}/commerce`, label: 'Commerce dashboard →' } : null}
        searchItems={pages.map((p) => ({ label: p.name, to: `${base}/pages/${p.id}` }))}
        searchPlaceholder="Search pages…"
      />
      <main className="p-6">
        <Outlet />
      </main>
      <FeedbackWidget area="cms" />
    </GlassShell>
  );
}
