-- Seeds the "Product" block catalog entry (table from 006). Renders a
-- single sellable product with a Buy button that links to the hosted
-- Stripe Checkout endpoint (GET /api/public/buy/:productId) -- see
-- renderProduct in blockRenderers.js and the checkout.session.completed
-- fulfillment in lib/commerce/routes.js.
--
-- Safe to re-run: ON CONFLICT DO NOTHING.

insert into nexus_block_catalog (id, org_id, block_type, name, category, description, default_fields, sort_order) values
  ('product', null, 'product', 'Product', 'Conversion', 'Sell one product with a Buy button that goes straight to a Stripe-hosted checkout. Set the Product ID from your Commerce > Products list; orders and confirmation emails are handled automatically.', '{"headings":["Product name"],"text":["A sentence about what makes it great."],"price":"$29","image":"https://placehold.co/520x520?text=Product","productId":"","buttonLabel":"Buy now"}'::jsonb, 16)
on conflict (id) do nothing;
