import express from 'express';
import { v4 as uuid } from 'uuid';
import { hasStripe } from './env.js';
import { commercePassiveAuth, requireCommerceTier, resolveCommerceCustomer } from './clerkAuth.js';
import * as productsRepo from './productsRepo.js';
import * as ordersRepo from './ordersRepo.js';
import * as customersRepo from './customersRepo.js';
import * as campaignsRepo from './campaignsRepo.js';
import * as cart from './cart.js';
import { stripe, createCheckoutSession, verifyWebhookSignature } from './stripeClient.js';
import { sendEmail, orderConfirmationEmail, refundEmail } from './resendClient.js';
import { captureEvent } from './posthogClient.js';
import { upsertProductVector, deleteProductVector, searchProducts } from './pineconeClient.js';
import { integrationStatus, testIntegration } from './integrations.js';
import { rowsToCsv, csvToRows } from '../csv.js';

const SESSION_COOKIE = 'commerce_session';

const getSessionId = (req, res) => {
  const existing = req.cookies?.[SESSION_COOKIE];
  if (existing) return existing;
  const id = uuid();
  res.cookie(SESSION_COOKIE, id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
  return id;
};

const orderTotal = (items) => items.reduce((sum, i) => sum + i.price * i.quantity, 0);

// Fulfills an order after a successful payment, regardless of whether it
// came from a real Stripe webhook or the local dev simulate-payment route:
// creates the order row, sends the confirmation email, fires PostHog, and
// applies campaign attribution. Shared so both paths behave identically.
async function fulfillOrder({ orgId, items, customer, campaignCode, paymentIntentId }) {
  const total = orderTotal(items);
  const order = await ordersRepo.createOrder({
    org_id: orgId ?? null,
    customer_id: customer?.id ?? null,
    customer_email: customer?.email ?? null,
    items,
    total,
    status: 'paid',
    campaign_code: campaignCode ?? null,
    stripe_payment_intent_id: paymentIntentId ?? null,
  });

  if (customer?.id) await customersRepo.addLifetimeValue(customer.id, total);
  if (campaignCode) await campaignsRepo.recordCampaignUsage(orgId, campaignCode, total);

  if (customer?.email) {
    const { subject, html } = orderConfirmationEmail(order);
    await sendEmail({ to: customer.email, subject, html });
  }

  captureEvent(customer?.clerk_id || 'anonymous', 'purchase_completed', {
    order_id: order.id,
    total,
    campaign_code: campaignCode ?? null,
    tier: customer?.tier ?? 'customer',
  });

  return order;
}

// Mounted BEFORE express.json() in server.js, since Stripe webhook signature
// verification (and, for consistency, the Clerk webhook below) needs the
// raw request body — express.json() would otherwise consume the stream
// first and leave nothing for these raw-body parsers to read.
export function mountCommerceWebhooks(app) {
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!hasStripe) return res.status(503).json({ error: 'Stripe is not configured' });

    let event;
    try {
      event = verifyWebhookSignature(req.body, req.headers['stripe-signature']);
    } catch (error) {
      console.error('[commerce] Stripe webhook signature verification failed:', error.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      // Platform subscription events (Nexus's own Starter/Pro/Agency
      // plans) share this endpoint -- checked first, and only claimed
      // when the event carries our nexus_org_id metadata, so workspace
      // commerce events below are untouched. Dynamic import avoids a
      // commerce<->billing module cycle.
      const { handleBillingEvent } = await import('../billing.js');
      if (await handleBillingEvent(event)) return res.json({ received: true });

      // One-off product purchases from the Product block's hosted
      // checkout (GET /api/public/buy/:productId in server.js) -- the
      // session carries the item as metadata, fulfilled through the same
      // path as cart payments (order row, LTV, confirmation email).
      if (event.type === 'checkout.session.completed' && event.data.object.metadata?.commerce_item) {
        const session = event.data.object;
        const orgId = session.metadata.org_id || null;
        const item = JSON.parse(session.metadata.commerce_item);
        const email = session.customer_details?.email || null;
        const customer = email ? await customersRepo.getCustomerByEmail(orgId, email) : null;
        await fulfillOrder({
          orgId,
          items: [item],
          customer: customer || (email ? { email } : null),
          campaignCode: null,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
        });
        return res.json({ received: true });
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object;
        const orgId = pi.metadata.org_id || null;
        const items = JSON.parse(pi.metadata.items || '[]');
        const customer = pi.metadata.customerEmail
          ? await customersRepo.getCustomerByEmail(orgId, pi.metadata.customerEmail)
          : null;
        await fulfillOrder({
          orgId,
          items,
          customer,
          campaignCode: pi.metadata.campaignCode || null,
          paymentIntentId: pi.id,
        });
      } else if (event.type === 'charge.refunded') {
        const charge = event.data.object;
        const order = await ordersRepo.getOrderByPaymentIntent(charge.payment_intent);
        if (order) {
          await ordersRepo.updateOrderStatus(order.org_id, order.id, 'refunded');
          if (order.customer_email) {
            const { subject, html } = refundEmail(order);
            await sendEmail({ to: order.customer_email, subject, html });
          }
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error('[commerce] Error handling Stripe webhook:', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
    // Signature verification (svix) happens once CLERK_WEBHOOK_SECRET is set;
    // in local dev mode this endpoint isn't reachable without Clerk anyway.
    try {
      const event = JSON.parse(req.body);
      if (event.type === 'user.created' || event.type === 'user.updated') {
        const { id, email_addresses, public_metadata } = event.data;
        await customersRepo.upsertCustomer({
          clerkId: id,
          email: email_addresses?.[0]?.email_address,
          tier: public_metadata?.tier || 'customer',
        });
      }
      res.json({ received: true });
    } catch (error) {
      console.error('[commerce] Error handling Clerk webhook:', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });
}

export function mountCommerceApi(app) {
  const router = express.Router();
  router.use(...commercePassiveAuth);

  // Which workspace this commerce request is for. The admin dashboard and any
  // signed-in member get it from resolveViewer (req.org, set globally in
  // server.js). Public storefront callers can pass ?orgId= or X-Org-Id.
  const orgIdFor = (req) => req.org?.id || req.header('x-org-id') || req.query.orgId || null;
  // Admin routes must have a workspace context.
  const requireOrgCtx = (req, res, next) => {
    if (!orgIdFor(req)) return res.status(400).json({ error: 'No workspace context for this store request.' });
    next();
  };

  // ---- Products ----
  router.get('/products', async (req, res) => {
    res.json(await productsRepo.listProducts(orgIdFor(req)));
  });

  router.get('/products/:id', async (req, res) => {
    const product = await productsRepo.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  });

  router.post('/products', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const product = await productsRepo.createProduct(orgIdFor(req), req.body);
    await upsertProductVector(product);
    res.json({ success: true, product });
  });

  router.put('/products/:id', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const product = await productsRepo.updateProduct(orgIdFor(req), req.params.id, req.body);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    await upsertProductVector(product);
    res.json({ success: true, product });
  });

  router.delete('/products/:id', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const removed = await productsRepo.deleteProduct(orgIdFor(req), req.params.id);
    if (!removed) return res.status(404).json({ error: 'Product not found' });
    await deleteProductVector(req.params.id);
    res.json({ success: true });
  });

  // ---- Search ----
  router.get('/search', async (req, res) => {
    const { q, alsoViewedFor } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });
    res.json(await searchProducts(q, { limit: 5, alsoViewedFor }));
  });

  // ---- Cart (Redis-backed, 5 min TTL) ----
  router.get('/cart', async (req, res) => {
    const sessionId = getSessionId(req, res);
    res.json({ items: await cart.getCart(sessionId) });
  });

  router.post('/cart', async (req, res) => {
    const sessionId = getSessionId(req, res);
    const { productId, variantId, quantity, name, price } = req.body;
    if (!productId || !quantity || price == null) {
      return res.status(400).json({ error: 'productId, quantity, and price are required' });
    }
    const items = await cart.addToCart(sessionId, { productId, variantId: variantId ?? null, quantity, name, price });
    res.json({ items });
  });

  router.delete('/cart', async (req, res) => {
    const sessionId = getSessionId(req, res);
    await cart.clearCart(sessionId);
    res.json({ success: true });
  });

  // ---- Checkout ----
  router.post('/checkout', async (req, res) => {
    const sessionId = getSessionId(req, res);
    const items = await cart.getCart(sessionId);
    if (items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    const { campaignCode } = req.body;
    const customer = await resolveCommerceCustomer(req);

    if (!hasStripe) {
      return res.json({
        localMode: true,
        message: 'Stripe is not configured. Use POST /api/commerce/dev/simulate-payment to complete this checkout locally.',
        items,
        total: orderTotal(items),
      });
    }

    const { clientSecret, sessionId: stripeSessionId } = await createCheckoutSession({
      items,
      successUrl: `${req.protocol}://${req.get('host')}/order/confirmation`,
      metadata: {
        items: JSON.stringify(items),
        campaignCode: campaignCode || '',
        customerEmail: customer?.email || '',
        org_id: orgIdFor(req) || '',
      },
    });

    res.json({ clientSecret, stripeSessionId });
  });

  // Only meaningful (and only mounted) when Stripe isn't configured — lets
  // the full product -> cart -> checkout -> order -> email flow be exercised
  // locally without live keys, calling the same fulfillOrder() path a real
  // Stripe webhook would.
  if (!hasStripe) {
    router.post('/dev/simulate-payment', async (req, res) => {
      const sessionId = getSessionId(req, res);
      const items = await cart.getCart(sessionId);
      if (items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

      const { campaignCode } = req.body;
      const customer = await resolveCommerceCustomer(req);
      const order = await fulfillOrder({
        orgId: orgIdFor(req),
        items,
        customer,
        campaignCode: campaignCode || null,
        paymentIntentId: `dev_${uuid()}`,
      });
      await cart.clearCart(sessionId);
      res.json({ success: true, order });
    });
  }

  // ---- Orders (admin dashboard) ----
  router.get('/orders', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    res.json(await ordersRepo.listOrders(orgIdFor(req)));
  });

  router.get('/orders/:id', async (req, res) => {
    const order = await ordersRepo.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });

  router.post('/orders/:id/status', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const { status } = req.body;
    if (!['pending', 'paid', 'refunded', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const order = await ordersRepo.updateOrderStatus(orgIdFor(req), req.params.id, status);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (status === 'refunded' && order.customer_email) {
      const { subject, html } = refundEmail(order);
      await sendEmail({ to: order.customer_email, subject, html });
    }
    res.json({ success: true, order });
  });

  // ---- Customers (admin dashboard) ----
  router.get('/customers', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    res.json(await customersRepo.listCustomers(orgIdFor(req)));
  });

  router.patch('/customers/:id/tier', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const { tier } = req.body;
    if (!['customer', 'wholesaler', 'admin'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    const customer = await customersRepo.updateCustomerTier(orgIdFor(req), req.params.id, tier);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ success: true, customer });
  });

  // ---- Discounts / campaigns (admin dashboard) ----
  router.get('/campaigns', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    res.json(await campaignsRepo.listCampaigns(orgIdFor(req)));
  });

  router.post('/campaigns', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    try {
      const campaign = await campaignsRepo.createCampaign(orgIdFor(req), req.body);
      res.json({ success: true, campaign });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/campaigns/:code', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const campaign = await campaignsRepo.updateCampaign(orgIdFor(req), req.params.code, req.body);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ success: true, campaign });
  });

  router.delete('/campaigns/:code', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const removed = await campaignsRepo.deleteCampaign(orgIdFor(req), req.params.code);
    if (!removed) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ success: true });
  });

  // ---- Connections hub ----
  router.get('/integrations/status', requireCommerceTier('admin'), (req, res) => {
    res.json(integrationStatus());
  });

  router.post('/integrations/test/:service', requireCommerceTier('admin'), async (req, res) => {
    const result = await testIntegration(req.params.service);
    res.status(result.ok ? 200 : 503).json(result);
  });

  // ---- CSV import/export ----
  const csvAttachment = (res, filename, csv) => {
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  };

  const PRODUCT_CSV_COLUMNS = [
    { key: 'id', header: 'id' }, { key: 'name', header: 'name' }, { key: 'sku', header: 'sku' },
    { key: 'price', header: 'price' }, { key: 'wholesale_price', header: 'wholesale_price' },
    { key: 'description', header: 'description' }, { key: 'inventory', header: 'inventory' },
    { key: 'status', header: 'status' }, { key: 'image_url', header: 'image_url' },
  ];
  router.get('/export/csv/products', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    csvAttachment(res, 'products.csv', rowsToCsv(await productsRepo.listProducts(orgIdFor(req)), PRODUCT_CSV_COLUMNS));
  });
  router.get('/export/csv/products/template', requireCommerceTier('admin'), (req, res) => {
    csvAttachment(res, 'products.template.csv', rowsToCsv([{ id: '', name: 'Example Product', sku: 'SKU-1', price: 19.99, wholesale_price: '', description: '', inventory: 0, status: 'active', image_url: '' }], PRODUCT_CSV_COLUMNS));
  });
  router.post('/import/csv/products', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const orgId = orgIdFor(req);
    const { csv } = req.body;
    if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
    const existing = await productsRepo.listProducts(orgId);
    let created = 0, updated = 0;
    const errors = [];
    for (const [idx, row] of csvToRows(csv).entries()) {
      try {
        if (!row.name?.trim() || !row.sku?.trim()) throw new Error('name and sku are required');
        const patch = {
          name: row.name || '', sku: row.sku || '', price: Number(row.price) || 0,
          wholesale_price: row.wholesale_price ? Number(row.wholesale_price) : null,
          description: row.description || '', inventory: Number(row.inventory) || 0,
          status: row.status || 'active', image_url: row.image_url || '',
        };
        const match = existing.find((p) => (row.id && p.id === row.id) || (row.sku && p.sku === row.sku));
        if (match) { await productsRepo.updateProduct(orgId, match.id, patch); updated++; }
        else { await productsRepo.createProduct(orgId, patch); created++; }
      } catch (err) {
        errors.push({ row: idx + 2, message: err.message });
      }
    }
    res.json({ created, updated, errors });
  });

  const ORDER_CSV_COLUMNS = [
    { key: 'id', header: 'id' }, { key: 'customer_email', header: 'customer_email' },
    { key: 'items_json', header: 'items_json' }, { key: 'total', header: 'total' },
    { key: 'status', header: 'status' }, { key: 'campaign_code', header: 'campaign_code' },
  ];
  router.get('/export/csv/orders', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const rows = (await ordersRepo.listOrders(orgIdFor(req))).map((o) => ({ ...o, items_json: JSON.stringify(o.items) }));
    csvAttachment(res, 'orders.csv', rowsToCsv(rows, ORDER_CSV_COLUMNS));
  });
  router.get('/export/csv/orders/template', requireCommerceTier('admin'), (req, res) => {
    csvAttachment(res, 'orders.template.csv', rowsToCsv([{ id: '', customer_email: 'buyer@example.com', items_json: '[{"productId":"","name":"Example","price":10,"quantity":1}]', total: 10, status: 'paid', campaign_code: '' }], ORDER_CSV_COLUMNS));
  });
  // Orders are normally created by checkout, not hand-edited — import is
  // create-only for new rows; a matching existing id only updates status.
  router.post('/import/csv/orders', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const orgId = orgIdFor(req);
    const { csv } = req.body;
    if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
    let created = 0, updated = 0;
    const errors = [];
    for (const [idx, row] of csvToRows(csv).entries()) {
      try {
        if (row.id) {
          const existing = await ordersRepo.getOrder(row.id);
          if (existing) {
            await ordersRepo.updateOrderStatus(orgId, row.id, row.status || existing.status);
            updated++;
            continue;
          }
        }
        if (!row.customer_email?.trim() && !row.items_json?.trim()) throw new Error('customer_email or items_json is required');
        const items = row.items_json ? JSON.parse(row.items_json) : [];
        await ordersRepo.createOrder({
          org_id: orgId, customer_email: row.customer_email || null, items,
          total: Number(row.total) || items.reduce((s, i) => s + i.price * i.quantity, 0),
          status: row.status || 'pending', campaign_code: row.campaign_code || null,
        });
        created++;
      } catch (err) {
        errors.push({ row: idx + 2, message: err.message });
      }
    }
    res.json({ created, updated, errors });
  });

  const CUSTOMER_CSV_COLUMNS = [
    { key: 'id', header: 'id' }, { key: 'clerk_id', header: 'clerk_id' }, { key: 'email', header: 'email' },
    { key: 'tier', header: 'tier' }, { key: 'lifetime_value', header: 'lifetime_value' },
  ];
  router.get('/export/csv/customers', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    csvAttachment(res, 'customers.csv', rowsToCsv(await customersRepo.listCustomers(orgIdFor(req)), CUSTOMER_CSV_COLUMNS));
  });
  router.get('/export/csv/customers/template', requireCommerceTier('admin'), (req, res) => {
    csvAttachment(res, 'customers.template.csv', rowsToCsv([{ id: '', clerk_id: 'user_example', email: 'customer@example.com', tier: 'customer', lifetime_value: 0 }], CUSTOMER_CSV_COLUMNS));
  });
  router.post('/import/csv/customers', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const orgId = orgIdFor(req);
    const { csv } = req.body;
    if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
    const existing = await customersRepo.listCustomers(orgId);
    let created = 0, updated = 0;
    const errors = [];
    for (const [idx, row] of csvToRows(csv).entries()) {
      try {
        if (!row.email?.trim()) throw new Error('email is required');
        const clerkId = row.clerk_id || `import-${row.email || idx}`;
        const wasExisting = existing.some((c) => c.clerk_id === clerkId || (row.email && c.email === row.email));
        await customersRepo.upsertCustomer({ orgId, clerkId, email: row.email || '', tier: row.tier || 'customer' });
        if (wasExisting) updated++; else created++;
      } catch (err) {
        errors.push({ row: idx + 2, message: err.message });
      }
    }
    res.json({ created, updated, errors });
  });

  const CAMPAIGN_CSV_COLUMNS = [
    { key: 'code', header: 'code' }, { key: 'discount_type', header: 'discount_type' },
    { key: 'discount_value', header: 'discount_value' }, { key: 'usage_limit', header: 'usage_limit' },
    { key: 'active', header: 'active' },
  ];
  router.get('/export/csv/campaigns', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    csvAttachment(res, 'discounts.csv', rowsToCsv(await campaignsRepo.listCampaigns(orgIdFor(req)), CAMPAIGN_CSV_COLUMNS));
  });
  router.get('/export/csv/campaigns/template', requireCommerceTier('admin'), (req, res) => {
    csvAttachment(res, 'discounts.template.csv', rowsToCsv([{ code: 'SAVE10', discount_type: 'percent', discount_value: 10, usage_limit: '', active: true }], CAMPAIGN_CSV_COLUMNS));
  });
  router.post('/import/csv/campaigns', requireCommerceTier('admin'), requireOrgCtx, async (req, res) => {
    const orgId = orgIdFor(req);
    const { csv } = req.body;
    if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
    let created = 0, updated = 0;
    const errors = [];
    for (const [idx, row] of csvToRows(csv).entries()) {
      try {
        const code = (row.code || '').toUpperCase().trim();
        if (!code) throw new Error('code is required');
        const patch = {
          discount_type: row.discount_type === 'fixed' ? 'fixed' : 'percent',
          discount_value: Number(row.discount_value) || 0,
          usage_limit: row.usage_limit ? Number(row.usage_limit) : null,
          active: String(row.active).toLowerCase() !== 'false',
        };
        const existing = await campaignsRepo.getCampaignByCode(orgId, code);
        if (existing) { await campaignsRepo.updateCampaign(orgId, code, patch); updated++; }
        else { await campaignsRepo.createCampaign(orgId, { code, ...patch }); created++; }
      } catch (err) {
        errors.push({ row: idx + 2, message: err.message });
      }
    }
    res.json({ created, updated, errors });
  });

  app.use('/api/commerce', router);
}
