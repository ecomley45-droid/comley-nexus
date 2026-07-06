import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './marketing/LandingPage.jsx';
import PausedGate from './cms/lib/PausedGate.jsx';
import RequireOrg from './cms/lib/RequireOrg.jsx';
import RequireSuperAdmin from './cms/lib/RequireSuperAdmin.jsx';
import SuperAdminLayout from './cms/lib/SuperAdminLayout.jsx';
import SuperAdminDashboardPage from './cms/pages/super-admin/SuperAdminDashboardPage.jsx';
import OrgsPage from './cms/pages/super-admin/OrgsPage.jsx';
import NexusSettingsPage from './cms/pages/super-admin/NexusSettingsPage.jsx';
import SuperAdminBillingPage from './cms/pages/super-admin/BillingPage.jsx';

// --- CMS ---
import CmsLayout from './cms/lib/CmsLayout.jsx';
import DashboardPage from './cms/pages/DashboardPage.jsx';
import PagesListPage from './cms/pages/PagesListPage.jsx';
import PageEditorPage from './cms/pages/PageEditorPage.jsx';
import BlocksCatalogPage from './cms/pages/BlocksCatalogPage.jsx';
import LibraryPage from './cms/pages/LibraryPage.jsx';
import MediaPage from './cms/pages/MediaPage.jsx';
import RedirectsPage from './cms/pages/RedirectsPage.jsx';
import CommentsPage from './cms/pages/CommentsPage.jsx';
import FormsPage from './cms/pages/FormsPage.jsx';
import ConnectionsPage from './cms/pages/ConnectionsPage.jsx';
import TeamPage from './cms/pages/TeamPage.jsx';
import SettingsPage from './cms/pages/SettingsPage.jsx';
import WorkspaceSettingsPage from './cms/pages/settings/WorkspaceSettingsPage.jsx';
import DesignSettingsPage from './cms/pages/settings/DesignSettingsPage.jsx';
import BillingSettingsPage from './cms/pages/settings/BillingSettingsPage.jsx';
import AuditLogPage from './cms/pages/AuditLogPage.jsx';
import ImportExportPage from './cms/pages/ImportExportPage.jsx';
import FeedbackPage from './cms/pages/FeedbackPage.jsx';
import OpsDashboardPage from './cms/pages/ops/DashboardPage.jsx';
import OpsSystemStatusPage from './cms/pages/ops/SystemStatusPage.jsx';
import OpsFeatureRequestsPage from './cms/pages/ops/FeatureRequestsPage.jsx';
import OpsSchedulePage from './cms/pages/ops/SchedulePage.jsx';
import OpsGitPullPage from './cms/pages/ops/GitPullPage.jsx';
import OpsProfilePage from './cms/pages/ops/ProfilePage.jsx';

// --- Commerce admin (per-org opt-in, gated in CmsLayout nav) ---
import CommerceLayout from './commerce/lib/CommerceLayout.jsx';
import HomePage from './commerce/pages/admin/HomePage.jsx';
import OrdersPage from './commerce/pages/admin/OrdersPage.jsx';
import OrderDetailPage from './commerce/pages/admin/OrderDetailPage.jsx';
import ProductsPage from './commerce/pages/admin/ProductsPage.jsx';
import ProductEditPage from './commerce/pages/admin/ProductEditPage.jsx';
import CustomersPage from './commerce/pages/admin/CustomersPage.jsx';
import DiscountsPage from './commerce/pages/admin/DiscountsPage.jsx';
import GrowthPage from './commerce/pages/admin/GrowthPage.jsx';
import ContentPage from './commerce/pages/admin/ContentPage.jsx';
import MarketsPage from './commerce/pages/admin/MarketsPage.jsx';
import FinancePage from './commerce/pages/admin/FinancePage.jsx';
import AnalyticsPage from './commerce/pages/admin/AnalyticsPage.jsx';

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
      <Routes>
        {/* Public marketing */}
        <Route path="/" element={<LandingPage />} />

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
      </PausedGate>
    </BrowserRouter>
  );
}
