// Thin fetch wrapper for the /api/commerce/* routes in lib/commerce/routes.js.
// Local dev mode (no Clerk configured) authorizes admin-only routes via the
// same X-User-Role/X-Customer-Id header-trust pattern the CMS uses — see
// lib/commerce/clerkAuth.js's fallback branch. This app is the admin
// dashboard, so it always identifies itself as an admin locally; once Clerk
// is configured these headers are ignored in favor of the real session.
const DEV_ADMIN_ID = 'dev-admin-dashboard';

// Exposed for csvClient.js, which needs these headers on plain fetch/blob
// downloads rather than going through request() below.
export const commerceAuthHeaders = { 'X-User-Role': 'admin', 'X-Customer-Id': DEV_ADMIN_ID };

async function request(path, options = {}) {
  const res = await fetch(`/api/commerce${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Role': 'admin',
      'X-Customer-Id': DEV_ADMIN_ID,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request to ${path} failed`);
  return data;
}

export const listProducts = () => request('/products');
export const getProduct = (id) => request(`/products/${id}`);
export const createProduct = (product) => request('/products', { method: 'POST', body: JSON.stringify(product) });
export const updateProduct = (id, patch) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
export const deleteProduct = (id) => request(`/products/${id}`, { method: 'DELETE' });
export const searchProducts = (q) => request(`/search?q=${encodeURIComponent(q)}`);

export const getCart = () => request('/cart');
export const addToCart = (item) => request('/cart', { method: 'POST', body: JSON.stringify(item) });
export const clearCart = () => request('/cart', { method: 'DELETE' });

export const startCheckout = (campaignCode) =>
  request('/checkout', { method: 'POST', body: JSON.stringify({ campaignCode }) });
export const simulatePayment = (campaignCode) =>
  request('/dev/simulate-payment', { method: 'POST', body: JSON.stringify({ campaignCode }) });

export const getOrder = (id) => request(`/orders/${id}`);
export const listOrders = () => request('/orders');
export const setOrderStatus = (id, status) => request(`/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });

export const listCustomers = () => request('/customers');
export const setCustomerTier = (id, tier) => request(`/customers/${id}/tier`, { method: 'PATCH', body: JSON.stringify({ tier }) });

export const listCampaigns = () => request('/campaigns');
export const createCampaign = (campaign) => request('/campaigns', { method: 'POST', body: JSON.stringify(campaign) });
export const updateCampaign = (code, patch) => request(`/campaigns/${code}`, { method: 'PUT', body: JSON.stringify(patch) });
export const deleteCampaign = (code) => request(`/campaigns/${code}`, { method: 'DELETE' });

export const getIntegrationStatus = () => request('/integrations/status');

// Doesn't use request()'s throw-on-!ok: a 503 here means "test ran and
// failed", which the Connections hub renders inline, not an error state.
export const testIntegration = async (service) => {
  const res = await fetch(`/api/commerce/integrations/test/${service}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-User-Role': 'admin', 'X-Customer-Id': DEV_ADMIN_ID },
  });
  return res.json();
};
