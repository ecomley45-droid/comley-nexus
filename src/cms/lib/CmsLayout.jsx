import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { getPages, getPreferences, exitViewAs } from './api.js';
import { GlassShell } from './ui/Glass.jsx';
import TopBar from './ui/TopBar.jsx';
import FeedbackWidget from './FeedbackWidget.jsx';
import AuthTokenBridge from './AuthTokenBridge.jsx';
import { useMe, useIsSuperAdmin } from './useMe.jsx';

// Nav item definitions live as relative paths so they can be rebased onto
// /:orgSlug at render time. That keeps the component agnostic to which
// org is active — for Ethan it's "/admin/*", for future clients it'll be
// "/{their-slug}/*".
const NAV_ITEMS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'pages', label: 'Pages' },
  { to: 'blocks', label: 'Blocks' },
  { to: 'library', label: 'Library' },
  { to: 'media', label: 'Media' },
  { to: 'redirects', label: 'Redirects' },
  { to: 'forms', label: 'Forms' },
  { to: 'comments', label: 'Comments' },
  // Import/Export is hidden while its backend is stubbed (501s in
  // server.js's DEFERRED SURFACES block) -- a live nav link to a dead
  // page costs trial credibility. Restore when CSV/static export ships.
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
      { to: 'settings', label: 'Overview', end: true },
      { to: 'settings/workspace', label: 'Workspace' },
      { to: 'settings/design', label: 'Design' },
      { to: 'team', label: 'Team & Permissions' },
      { to: 'connections', label: 'Integrations' },
      { to: 'settings/billing', label: 'Billing' },
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
  const { me, refresh } = useMe();
  const isSuperAdmin = useIsSuperAdmin();
  const [pages, setPages] = useState([]);
  const [commerceEnabled, setCommerceEnabled] = useState(false);
  const navigate = useNavigate();

  const exitWorkspaceView = async () => {
    try { await exitViewAs(); } catch { /* cookie may already be gone */ }
    await refresh();
    navigate('/super-admin');
  };

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

  const logoLabel = me?.org?.name ? `Nexus · ${me.org.name}` : 'Nexus';

  // Client workspace management and Nexus's own site now live at
  // /super-admin, outside this org-scoped console entirely — this link is
  // just a jump point, visible only to platform super-admins.
  const superAdminExtra = isSuperAdmin ? { to: '/super-admin', label: 'Nexus Super Admin →' } : null;

  return (
    <GlassShell>
      <AuthTokenBridge />
      {me?.org?.viewingAs && (
        <div className="mx-4 mt-4 rounded-xl bg-gradient-to-r from-glass-indigo/30 to-glass-fuchsia/30 border border-white/15 px-4 py-2 flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-100">
            Viewing <strong>{me.org.name}</strong> as Nexus Super Admin
          </span>
          <button onClick={exitWorkspaceView} className="text-zinc-200 hover:text-white underline underline-offset-2 shrink-0">
            Exit
          </button>
        </div>
      )}
      <TopBar
        logoTo={base}
        logoLabel={logoLabel}
        navItems={navItems}
        extraNavItem={superAdminExtra || (commerceEnabled ? { to: `${base}/commerce`, label: 'Commerce dashboard →' } : null)}
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
