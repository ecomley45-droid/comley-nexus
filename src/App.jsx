import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import ProductListPage from './commerce/pages/ProductListPage.jsx';
import ProductPage from './commerce/pages/ProductPage.jsx';
import CartPage from './commerce/pages/CartPage.jsx';
import CheckoutPage from './commerce/pages/CheckoutPage.jsx';
import OrderConfirmationPage from './commerce/pages/OrderConfirmationPage.jsx';
import CmsLayout from './cms/lib/CmsLayout.jsx';
import DashboardPage from './cms/pages/DashboardPage.jsx';
import PagesListPage from './cms/pages/PagesListPage.jsx';
import PageEditorPage from './cms/pages/PageEditorPage.jsx';
import LibraryPage from './cms/pages/LibraryPage.jsx';
import MediaPage from './cms/pages/MediaPage.jsx';
import RedirectsPage from './cms/pages/RedirectsPage.jsx';
import CommentsPage from './cms/pages/CommentsPage.jsx';
import ConnectionsPage from './cms/pages/ConnectionsPage.jsx';
import TeamPage from './cms/pages/TeamPage.jsx';
import SettingsPage from './cms/pages/SettingsPage.jsx';
import AuditLogPage from './cms/pages/AuditLogPage.jsx';
import ImportExportPage from './cms/pages/ImportExportPage.jsx';
import FeedbackPage from './cms/pages/FeedbackPage.jsx';
import OpsDashboardPage from './cms/pages/ops/DashboardPage.jsx';
import OpsSystemStatusPage from './cms/pages/ops/SystemStatusPage.jsx';
import OpsFeatureRequestsPage from './cms/pages/ops/FeatureRequestsPage.jsx';
import OpsSchedulePage from './cms/pages/ops/SchedulePage.jsx';
import OpsGitPullPage from './cms/pages/ops/GitPullPage.jsx';
import OpsProfilePage from './cms/pages/ops/ProfilePage.jsx';
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
import { GlassShell, GlassPanel, GlassButton } from './cms/lib/ui/Glass.jsx';

function Home() {
  return (
    <GlassShell>
      <div className="max-w-xl mx-auto p-6 pt-24">
        <GlassPanel className="p-8 text-center">
          <h1 className="text-3xl font-semibold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-glass-indigo via-glass-fuchsia to-glass-sky">
            Nexus Commerce
          </h1>
          <div className="flex gap-3 justify-center">
            <Link to="/shop"><GlassButton>Shop</GlassButton></Link>
            <Link to="/cart"><GlassButton variant="secondary">Cart</GlassButton></Link>
            <Link to="/admin"><GlassButton variant="secondary">Admin</GlassButton></Link>
          </div>
        </GlassPanel>
      </div>
    </GlassShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<ProductListPage />} />
        <Route path="/shop/:id" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order/confirmation" element={<OrderConfirmationPage />} />

        <Route path="/admin" element={<CmsLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pages" element={<PagesListPage />} />
          <Route path="pages/:id" element={<PageEditorPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="redirects" element={<RedirectsPage />} />
          <Route path="comments" element={<CommentsPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="import-export" element={<ImportExportPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="ops/dashboard" element={<OpsDashboardPage />} />
          <Route path="ops/system-status" element={<OpsSystemStatusPage />} />
          <Route path="ops/feature-requests" element={<OpsFeatureRequestsPage />} />
          <Route path="ops/schedule" element={<OpsSchedulePage />} />
          <Route path="ops/git-pull" element={<OpsGitPullPage />} />
          <Route path="ops/profile" element={<OpsProfilePage />} />
        </Route>

        <Route path="/admin/commerce" element={<CommerceLayout />}>
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
      </Routes>
    </BrowserRouter>
  );
}
