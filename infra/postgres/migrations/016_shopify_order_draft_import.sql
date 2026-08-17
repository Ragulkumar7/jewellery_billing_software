-- 016_shopify_order_draft_import.sql
-- Idempotent Shopify order import: at most one ERP draft sales order per
-- Shopify order. Webhooks and full syncs can run concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_shopify_order_id_unique
  ON sales_orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL;