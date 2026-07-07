import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PausedGate from './cms/lib/PausedGate.jsx';
import RequireOrg from './cms/lib/RequireOrg.jsx';
import RequireSuperAdmin from './cms/lib/RequireSuperAdmin.jsx';

// Every page is a lazy route-level chunk -- the whole app previously
// shipped as one ~617 KB bundle where signing in to edit a page also
// downloaded all of commerce, super-admin, and ops. Layouts and guards
// stay eager (they render on every route); everything else loads on
// first navigation to it.
const LandingPage = lazy(() => import('./marketing/LandingPage.jsx'));
const WelcomePage = lazy(() => import('./cms/pages/WelcomePage.jsx'));
const SuperAdminLayout = lazy(() => import('./cms/lib/SuperAdminLayout.jsx'));
const SuperAdminDashboardPage = lazy(() => import('./cms/pages/super-admin/SuperAdminDashboardPage.jsx'));
const OrgsPage = lazy(() => import('./cms/pages/super-admin/OrgsPage.jsx'));
const NexusSettingsPage = lazy(() => import('./cms/pages/super-admin/NexusSettingsPage.jsx'));
const SuperAdminBillingPage = lazy(() => import('./cms/pages/super-admin/BillingPage.jsx'));

// --- CMS ---
const CmsLayout = lazy(() => import('./cms/lib/CmsLayout.jsx'));
const DashboardPage = lazy(() => import('./cms/pages/DashboardPage.jsx'));
const PagesListPage = lazy(() => import('./cms/pages/PagesListPage.jsx'));
const PageEditorPage = lazy(() => import('./cms/pages/PageEditorPage.jsx'));
const BlocksCatalogPage = lazy(() => import('./cms/pages/BlocksCatalogPage.jsx'));
const LibraryPage = lazy(() => import('./cms/pages/LibraryPage.jsx'));
const MediaPage = lazy(() => import('./cms/pages/MediaPage.jsx'));
const RedirectsPage = lazy(() => import('./cms/pages/RedirectsPage.jsx'));
const CommentsPage = lazy(() => import('./cms/pages/CommentsPage.jsx'));
const FormsPage = lazy(() => import('./cms/pages/FormsPage.jsx'));
const ConnectionsPage = lazy(() => import('./cms/pages/ConnectionsPage.jsx'));
const TeamPage = lazy(() => import('./cms/pages/TeamPage.jsx'));
const SettingsPage = lazy(() => import('./cms/pages/SettingsPage.jsx'));
const WorkspaceSettingsPage = lazy(() => import('./cms/pages/settings/WorkspaceSettingsPage.jsx'));
const DesignSettingsPage = lazy(() => import('./cms/pages/settings/DesignSettingsPage.jsx'));
const BillingSettingsPage = lazy(() => import('./cms/pages/settings/BillingSettingsPage.jsx'));
const AuditLogPage = lazy(() => import('./cms/pages/AuditLogPage.jsx'));
const TemplateMarketplacePage = lazy(() => import('./cms/pages/TemplateMarketplacePage.jsx'));
const TemplateDetailPage = lazy(() => import('./cms/pages/TemplateDetailPage.jsx'));
const BackupsPage = lazy(() => import('./cms/pages/settings/BackupsPage.jsx'));
const ImportExportPage = lazy(() => import('./cms/pages/ImportExportPage.jsx'));
const FeedbackPage = lazy(() => import('./cms/pages/FeedbackPage.jsx'));
const OpsDashboardPage = lazy(() => import('./cms/pages/ops/DashboardPage.jsx'));
const OpsSystemStatusPage = lazy(() => import('./cms/pages/ops/SystemStatusPage.jsx'));
const OpsFeatureRequestsPage = lazy(() => import('./cms/pages/ops/FeatureRequestsPage.jsx'));
const OpsSchedulePage = lazy(() => import('./cms/pages/ops/SchedulePage.jsx'));
const OpsGitPullPage = lazy(() => import('./cms/pages/ops/GitPullPage.jsx'));
const OpsProfilePage = lazy(() => import('./cms/pages/ops/ProfilePage.jsx'));

// --- Commerce admin (per-org opt-in, gated in CmsLayout nav) ---
const CommerceLayout = lazy(() => import('./commerce/lib/CommerceLayout.jsx'));
const HomePage = lazy(() => import('./commerce/pages/admin/HomePage.jsx'));
const OrdersPage = lazy(() => import('./commerce/pages/admin/OrdersPage.jsx'));
const OrderDetailPage = lazy(() => import('./commerce/pages/admin/OrderDetailPage.jsx'));
const ProductsPage = lazy(() => import('./commerce/pages/admin/ProductsPage.jsx'));
const ProductEditPage = lazy(() => import('./commerce/pages/admin/ProductEditPage.jsx'));
const CustomersPage = lazy(() => import('./commerce/pages/admin/CustomersPage.jsx'));
const DiscountsPage = lazy(() => import('./commerce/pages/admin/DiscountsPage.jsx'));
const GrowthPage = lazy(() => import('./commerce/pages/admin/GrowthPage.jsx'));
const ContentPage = lazy(() => import('./commerce/pages/admin/ContentPage.jsx'));
const MarketsPage = lazy(() => import('./commerce/pages/admin/MarketsPage.jsx'));
const FinancePage = lazy(() => import('./commerce/pages/admin/FinancePage.jsx'));
const AnalyticsPage = lazy(() => import('./commerce/pages/admin/AnalyticsPage.jsx'));

const routeFallback = (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#070a13', color: '#a1a1aa', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
    Loading…
  </div>
);

// The /:orgSlug route param is a client workspace's slug — e.g. Comley
// Creative (Nexus's first client) is /comley-creative/*. RequireOrg
// enforces sign-in + org-match on every child route.
//
// /super-admin/* is a separate, sibling tree: operating the Nexus platform
// itself (every client workspace, plus Nexus's own site pages). It is NOT
// nested under any :orgSlug and is gated by RequireSuperAdmin (ADMIN_EMAILS),
// independent of org membership.

export default function App() {
  return (
    <BrowserRouter>
      <PausedGate>
      <Suspense fallback={routeFallback}>
      <Routes>
        {/* Public marketing */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/welcome" element={<WelcomePage />} />

        {/* Legacy /admin/commerce/* URLs still resolve — reroute them onto
            the new /:orgSlug/commerce/* structure so old bookmarks work.
            Wildcard-preserving redirect. */}
        <Route path="/admin/commerce/*" element={<Navigate to="/admin/commerce" replace />} />

        {/* Nexus Super Admin: operates the platform, not any single
            workspace. Client onboarding + Nexus's own site pages live here. */}
        <Route path="/super-admin" element={<RequireSuperAdmin><SuperAdminLayout /></RequireSuperAdmin>}>
          <Route index element={<SuperAdminDashboardPage />} />
          <Route path="orgs" element={<OrgsPage />} />
          <Route path="pages" element={<PagesListPage nexus />} />
          <Route path="pages/:id" element={<PageEditorPage nexus />} />
          <Route path="blocks" element={<BlocksCatalogPage />} />
          <Route path="billing" element={<SuperAdminBillingPage />} />
          <Route path="settings" element={<NexusSettingsPage />} />
        </Route>

        {/* CMS (org-scoped). Comley Creative, Nexus's first client, lives
            at /comley-creative — future clients land at /their-slug. */}
        <Route path="/:orgSlug" element={<RequireOrg><CmsLayout /></RequireOrg>}>
          <Route index element={<DashboardPage />} />
          <Route path="pages" element={<PagesListPage />} />
          <Route path="pages/:id" element={<PageEditorPage />} />
          <Route path="blocks" element={<BlocksCatalogPage />} />
          <Route path="templates" element={<TemplateMarketplacePage />} />
          <Route path="templates/:id" element={<TemplateDetailPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="redirects" element={<RedirectsPage />} />
          <Route path="comments" element={<CommentsPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/workspace" element={<WorkspaceSettingsPage />} />
          <Route path="settings/design" element={<DesignSettingsPage />} />
          <Route path="settings/backups" element={<BackupsPage />} />
          <Route path="settings/billing" element={<BillingSettingsPage />} />
          <Route path="import-export" element={<ImportExportPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="ops/dashboard" element={<OpsDashboardPage />} />
          <Route path="ops/system-status" element={<OpsSystemStatusPage />} />
          <Route path="ops/feature-requests" element={<OpsFeatureRequestsPage />} />
          <Route path="ops/schedule" element={<OpsSchedulePage />} />
          <Route path="ops/git-pull" element={<OpsGitPullPage />} />
          <Route path="ops/profile" element={<OpsProfilePage />} />
        </Route>

        {/* Commerce admin, mounted under the org slug. Sign-in required
            and the CmsLayout nav hides this section unless the org has
            the commerce feature enabled. */}
        <Route path="/:orgSlug/commerce" element={<RequireOrg><CommerceLayout /></RequireOrg>}>
          <Route index element={<HomePage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:id" element={<ProductEditPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="discounts" element={<DiscountsPage />} />
          <Route path="growth" element={<GrowthPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="markets" element={<MarketsPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>

        {/* Catch-all: anything that didn't match (old /shop, /cart, /checkout,
            typos) redirects back to the marketing landing. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </PausedGate>
    </BrowserRouter>
  );
}
