// Pure calculations over orders/customers/campaigns/products, shared by
// HomePage, GrowthPage, FinancePage, and AnalyticsPage so each metric is
// computed in exactly one place.

export const ORDER_STATUSES = ['paid', 'pending', 'refunded', 'cancelled'];

export function revenueByStatus(orders) {
  return Object.fromEntries(
    ORDER_STATUSES.map((s) => [s, orders.filter((o) => o.status === s).reduce((sum, o) => sum + o.total, 0)])
  );
}

export function netRevenue(orders) {
  const totals = revenueByStatus(orders);
  return totals.paid - totals.refunded;
}

export function averageOrderValue(orders) {
  const paid = orders.filter((o) => o.status === 'paid');
  if (paid.length === 0) return 0;
  return paid.reduce((sum, o) => sum + o.total, 0) / paid.length;
}

// Groups orders by calendar day over the trailing `days` window (default 14).
export function ordersPerDay(orders, days = 14) {
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push(d.toISOString().slice(0, 10));
  }
  const counts = Object.fromEntries(buckets.map((d) => [d, 0]));
  orders.forEach((o) => {
    const day = o.created_at.slice(0, 10);
    if (day in counts) counts[day]++;
  });
  return buckets.map((day) => ({ day, count: counts[day] }));
}

export function topProductsByRevenue(orders, limit = 8) {
  const byProduct = new Map();
  orders.filter((o) => o.status === 'paid').forEach((o) => {
    o.items.forEach((item) => {
      const revenue = item.price * item.quantity;
      byProduct.set(item.name, (byProduct.get(item.name) || 0) + revenue);
    });
  });
  return [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function purchasesByTier(orders, customers) {
  const tierById = new Map(customers.map((c) => [c.id, c.tier]));
  const counts = { customer: 0, wholesaler: 0, admin: 0, guest: 0 };
  orders.filter((o) => o.status === 'paid').forEach((o) => {
    const tier = o.customer_id ? tierById.get(o.customer_id) || 'customer' : 'guest';
    counts[tier] = (counts[tier] || 0) + 1;
  });
  return counts;
}

export function attributedCampaigns(campaigns) {
  return campaigns.filter((c) => c.usage_count > 0).sort((a, b) => b.revenue_attributed - a.revenue_attributed);
}

export function lowInventoryProducts(products, threshold = 5) {
  return products.filter((p) => p.status === 'active' && p.inventory <= threshold).sort((a, b) => a.inventory - b.inventory);
}
