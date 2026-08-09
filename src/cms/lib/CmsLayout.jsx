import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { getPages, getPreferences, exitViewAs, getSocialStatus } from './api.js';
import { GlassShell } from './ui/Glass.jsx';
import AppShell from './ui/AppShell.jsx';
import FeedbackWidget from './FeedbackWidget.jsx';
import AuthTokenBridge from './AuthTokenBridge.jsx';
import CommandPalette from './CommandPalette.jsx';
import {
  LayoutDashboard, FileText, Database, CalendarDays, Image, Inbox, MessageSquare,
  LayoutTemplate, Blocks, BookMarked, Mail, Share2, Settings, Building2, Palette,
  Users, Plug, CreditCard, ScrollText, ArrowLeftRight, Archive, Wrench, Activity,
  GitPullRequest, CalendarClock, Lightbulb, ShoppingBag,
} from 'lucide-react';
import { useMe, useIsSuperAdmin, usePermissions } from './useMe.jsx';
import { can } from '../../shared/permissions.js';
import { setDocumentFavicon } from './favicon.js';

// Navigation.
//
// Grouped by the job being done rather than listed flat. Fifteen unlabelled
// top-level links meant scanning the whole rail to find anything and gave no
// hint which surfaces relate to each other -- Blocks / Templates / Library
// in particular read as three names for the same idea. Sections make the
// relationships obvious and cut the top-level list to what someone reaches
// for daily.
//
// Paths are relative so they can be rebased onto /:orgSlug at render time,
// keeping this component agnostic to which workspace is active.
//
// `section: true` is a heading with items under it — not itself a link.
// `children` is a collapsible group that IS also a link (it has a real
// landing page). Mixing the two behaviours on one row is what made the old
// "click the label or click the chevron?" ambiguity.
const NAV_ITEMS = [
  { to: '', label: 'Dashboard', end: true, icon: LayoutDashboard },

  {
    section: true,
    label: 'Content',
    children: [
      { to: 'pages', label: 'Pages', icon: FileText, pageKey: 'pages' },
      { to: 'collections', label: 'Collections', icon: Database, pageKey: 'collections' },
      { to: 'events', label: 'Events', icon: CalendarDays, pageKey: 'events' },
      { to: 'media', label: 'Media', icon: Image, pageKey: 'media' },
      { to: 'forms', label: 'Form responses', icon: Inbox, pageKey: 'forms' },
      { to: 'comments', label: 'Comments', icon: MessageSquare, pageKey: 'comments' },
    ],
  },

  {
    section: true,
    label: 'Design',
    children: [
      // Renamed from "Templates / Blocks / Library", which read as three
      // words for one thing. These are: whole starter sites, the palette of
      // block types, and your own saved sections.
      { to: 'templates', label: 'Site templates', icon: LayoutTemplate, pageKey: 'templates' },
      { to: 'blocks', label: 'Block catalog', icon: Blocks, pageKey: 'blocks' },
      { to: 'library', label: 'Saved sections', icon: BookMarked, pageKey: 'library' },
      { to: 'settings/design', label: 'Theme & branding', icon: Palette, pageKey: 'design' },
    ],
  },

  {
    section: true,
    label: 'Marketing',
    children: [
      { to: 'email', label: 'Newsletter', icon: Mail, pageKey: 'email' },
      // Spliced out below when the workspace doesn't have the social flag.
      { to: 'social', label: 'Social', icon: Share2, social: true, pageKey: 'social' },
    ],
  },

  {
    to: 'settings',
    label: 'Settings',
    icon: Settings,
    pinned: true,
    children: [
      { to: 'settings', label: 'Overview', end: true, icon: Settings },
      { to: 'settings/workspace', label: 'Workspace', icon: Building2, pageKey: 'workspace' },
      { to: 'team', label: 'Team & permissions', icon: Users, pageKey: 'team' },
      { to: 'connections', label: 'Integrations', icon: Plug, pageKey: 'connections' },
      { to: 'redirects', label: 'Redirects', icon: ArrowLeftRight, pageKey: 'redirects' },
      { to: 'settings/backups', label: 'Backups', icon: Archive, pageKey: 'backups' },
      { to: 'settings/billing', label: 'Billing', icon: CreditCard, pageKey: 'billing' },
      { to: 'audit', label: 'Audit log', icon: ScrollText, pageKey: 'audit' },
    ],
  },

  {
    to: 'ops/dashboard',
    label: 'Ops',
    icon: Wrench,
    pinned: true,
    children: [
      { to: 'ops/dashboard', label: 'Overview', end: true, icon: Wrench },
      { to: 'feedback', label: 'Feedback inbox', icon: Lightbulb, pageKey: 'feedback' },
      { to: 'ops/system-status', label: 'System status', icon: Activity },
      { to: 'ops/feature-requests', label: 'Feature requests', icon: Lightbulb },
      { to: 'ops/schedule', label: 'Schedule', icon: CalendarClock },
      // A deploy tool has no business in a client's CMS -- super admin only.
      { to: 'ops/git-pull', label: 'Git pull', icon: GitPullRequest, superAdmin: true },
      // Profile is reached from the avatar in the top bar and the rail
      // footer, which is where every other app puts it.
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
  const permissions = usePermissions();
  const [commerceEnabled, setCommerceEnabled] = useState(false);
  const [socialEnabled, setSocialEnabled] = useState(false);
  const [searchSignal, setSearchSignal] = useState(0);
  const navigate = useNavigate();

  const exitWorkspaceView = async () => {
    try { await exitViewAs(); } catch { /* cookie may already be gone */ }
    await refresh();
    navigate('/super-admin');
  };

  useEffect(() => {
    // Only the favicon is needed here now — page search moved to the
    // command palette, which fetches its own list lazily on first open.
    getPages()
      .then((d) => setDocumentFavicon(d.globalSettings?.favicon))
      .catch(() => {});
  }, []);

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

  // Feature flags prune items at BOTH levels now that the nav is grouped —
  // a hidden child used to leave its parent section rendering an empty box.
  const navItems = useMemo(() => {
    const allowed = (item) => {
      if (item.social && !socialEnabled) return false;
      if (item.superAdmin && !isSuperAdmin) return false;
      // RBAC: hide a page this role can't view. Skipped while permissions are
      // still loading (null) so the nav doesn't flash empty; the server
      // enforces access regardless.
      if (item.pageKey && permissions && !can(permissions, item.pageKey, 'view')) return false;
      return true;
    };
    const filtered = NAV_ITEMS
      .filter(allowed)
      .map((item) => (item.children ? { ...item, children: item.children.filter(allowed) } : item))
      .filter((item) => !item.section || item.children.length > 0);

    const items = rebaseNav(filtered, base);
    // Commerce is a whole separate console, so it sits on its own at the
    // bottom rather than inside a content group.
    if (commerceOn) items.push({ to: `${base}/commerce`, label: 'Commerce', icon: ShoppingBag, pinned: true });
    return items;
  }, [base, commerceOn, socialEnabled, isSuperAdmin, permissions]);

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
        onSearch={() => setSearchSignal((n) => n + 1)}
        searchPlaceholder="Search pages and settings…"
        banner={banner}
      >
        <Outlet />
      </AppShell>
      <FeedbackWidget area="cms" />
      <CommandPalette base={base} openSignal={searchSignal} />
    </GlassShell>
  );
}
