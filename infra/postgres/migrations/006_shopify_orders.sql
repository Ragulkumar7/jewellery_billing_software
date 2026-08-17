CREATE TABLE IF NOT EXISTS shopify_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id text NOT NULL UNIQUE,
  order_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  order_date timestamptz NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  payment_status text,
  fulfillment_status text,
  sync_status text NOT NULL DEFAULT 'Imported',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_date ON shopify_orders(order_date DESC);
