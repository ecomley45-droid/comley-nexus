import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { getPages, getPreferences, exitViewAs, getSocialStatus, getSiteStatus } from './api.js';
import { GlassShell } from './ui/Glass.jsx';
import AppShell from './ui/AppShell.jsx';
import DeployBar from './ui/DeployBar.jsx';
import FeedbackWidget from './FeedbackWidget.jsx';
import AuthTokenBridge from './AuthTokenBridge.jsx';
import CommandPalette from './CommandPalette.jsx';
import { useMe, useIsSuperAdmin } from './useMe.jsx';

// Nav item definitions live as relative paths so they can be rebased onto
// /:orgSlug at render time. That keeps the component agnostic to which
// org is active — for Ethan it's "/admin/*", for future clients it'll be
// "/{their-slug}/*".
// `feature` keys let Demo Mode badge an item "Coming soon" and lock its pages
// (see AppShell). They match the Settings > Demo picker's options.
const NAV_ITEMS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'pages', label: 'Pages', feature: 'pages' },
  { to: 'blocks', label: 'Blocks', feature: 'blocks' },
  { to: 'templates', label: 'Templates', feature: 'templates' },
  { to: 'library', label: 'Library', feature: 'library' },
  { to: 'media', label: 'Media', feature: 'media' },
  { to: 'events', label: 'Events', feature: 'events' },
  { to: 'redirects', label: 'Redirects', feature: 'redirects' },
  { to: 'forms', label: 'Forms', feature: 'forms' },
  { to: 'comments', label: 'Comments', feature: 'comments' },
  // Social is per-org (feature_flags.social); the group is spliced in below
  // only when the workspace has it enabled, so it isn't rebased when absent.
  {
    to: 'social',
    label: 'Social',
    social: true,
    feature: 'social',
    children: [
      { to: 'social', label: 'Dashboard', end: true },
      { to: 'social/compose', label: 'Compose' },
      { to: 'social/calendar', label: 'Calendar' },
      { to: 'social/accounts', label: 'Accounts' },
    ],
  },
  // Newsletter (email builder) — a standard CMS feature, available to every
  // workspace independent of Commerce. Sending stays safe: it only delivers
  // for real when Resend is configured, otherwise it sandboxes.
  {
    to: 'email',
    label: 'Newsletter',
    feature: 'newsletter',
    children: [
      { to: 'email', label: 'Templates', end: true },
      { to: 'email/campaigns', label: 'Campaigns' },
    ],
  },
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
      { to: 'settings/deploy', label: 'Deploy & Demo' },
      { to: 'settings/backups', label: 'Backups' },
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
  const [socialEnabled, setSocialEnabled] = useState(false);
  const [siteStatus, setSiteStatus] = useState(null);
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

  // Commerce is a real nav item (not the single "extra" slot, which the
  // Super Admin link owns) so it shows for admins and super-admins alike when
  // the store is enabled. Enabled via Settings > Workspace > Online store, or
  // the per-org feature flag.
  const commerceOn = commerceEnabled || !!me?.org?.feature_flags?.commerce;

  // Social is a paid-tier feature (feature_flags.social) — the server reports
  // whether it's on for this workspace (or forced on by SOCIAL_SANDBOX in dev),
  // and its nav group is filtered out until enabled. Newsletter, by contrast,
  // is a standard feature shown for every workspace.
  useEffect(() => {
    getSocialStatus()
      .then((s) => setSocialEnabled(!!s?.enabled))
      .catch(() => {});
  }, []);

  // Staging/deploy + demo-mode state drives the Deploy bar and the coming-soon
  // badges/lock. One fetch, shared by both.
  useEffect(() => { getSiteStatus().then(setSiteStatus).catch(() => {}); }, []);

  const navItems = useMemo(() => {
    const filtered = NAV_ITEMS.filter((i) => (i.social ? socialEnabled : true));
    const items = rebaseNav(filtered, base);
    if (commerceOn) items.push({ to: `${base}/commerce`, label: 'Commerce' });
    return items;
  }, [base, commerceOn, socialEnabled]);

  // White-label (Agency tier): a workspace with feature_flags.white_label
  // shows the agency's brand instead of Nexus anywhere in the client-facing
  // chrome. Set per-org from Super Admin > Client workspaces.
  const whiteLabel = me?.org?.feature_flags?.white_label?.name || '';
  const logoLabel = whiteLabel
    ? (me?.org?.name ? `${whiteLabel} · ${me.org.name}` : whiteLabel)
    : (me?.org?.name ? `Nexus · ${me.org.name}` : 'Nexus');

  // Client workspace management and Nexus's own site now live at
  // /super-admin, outside this org-scoped console entirely — this link is
  // just a jump point, visible only to platform super-admins.
  const superAdminExtra = isSuperAdmin ? { to: '/super-admin', label: 'Nexus Super Admin →' } : null;

  const banner = me?.org?.viewingAs ? (
    <div className="mx-4 mt-4 rounded-xl bg-gradient-to-r from-glass-indigo/30 to-glass-fuchsia/30 border border-white/15 px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-100">
        Viewing <strong>{me.org.name}</strong> as Nexus Super Admin
      </span>
      <button onClick={exitWorkspaceView} className="text-zinc-200 hover:text-white underline underline-offset-2 shrink-0">
        Exit
      </button>
    </div>
  ) : null;

  return (
    <GlassShell>
      <AuthTokenBridge />
      <AppShell
        logoTo={base}
        logoLabel={logoLabel}
        navItems={navItems}
        extraNavItem={superAdminExtra}
        searchItems={pages.map((p) => ({ label: p.name, to: `${base}/pages/${p.id}` }))}
        searchPlaceholder="Search pages…"
        banner={banner}
        rightSlot={<DeployBar status={siteStatus} onChange={setSiteStatus} />}
        comingSoon={siteStatus?.comingSoon || []}
        demoMode={!!siteStatus?.demoMode}
      >
        <Outlet />
      </AppShell>
      <FeedbackWidget area="cms" />
      <CommandPalette base={base} />
    </GlassShell>
  );
}
