ALTER TABLE customers ADD COLUMN IF NOT EXISTS shopify_customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shopify_customer_id ON customers(shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS shopify_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shopify_customer_id text NOT NULL UNIQUE,
  name text NOT NULL, mobile text, email text, total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric(14,2) NOT NULL DEFAULT 0, synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ADD CONSTRAINT invoices_customer_required CHECK (customer_id IS NOT NULL) NOT VALID;
