-- 011_sales_module.sql
-- Sales Module (Final Requirement):
--   * invoices gain source (Internal/Shopify), shopify order link, confirmed/cancelled/returned audit columns
--   * sales_orders gain source, totals, confirmed/cancelled audit columns and a line-items table
--   * new permissions + role grants for confirm / return / price override / discount / record payment / convert

-- ---------- invoices ----------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'Internal';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shopify_order_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returned_by uuid REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS price_override_reason text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS invoices_invoice_date_idx ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS invoices_source_idx ON invoices(source);
CREATE INDEX IF NOT EXISTS invoices_payment_status_idx ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS invoices_shopify_order_idx ON invoices(shopify_order_id);

-- ---------- sales_orders ----------
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'Internal';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shopify_order_id text;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS silver_rate numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS gst_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS round_off numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES users(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS sales_orders_status_idx ON sales_orders(status);
CREATE INDEX IF NOT EXISTS sales_orders_source_idx ON sales_orders(source);

-- sales_order_items: line items frozen at order creation (prices never re-derived)
CREATE TABLE IF NOT EXISTS sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  sku text, name text NOT NULL, purity text, gross_weight numeric(12,3) NOT NULL DEFAULT 0,
  net_weight numeric(12,3) NOT NULL DEFAULT 0, stone_weight numeric(12,3) NOT NULL DEFAULT 0,
  silver_rate numeric(14,2) NOT NULL DEFAULT 0, making_charge numeric(14,2) NOT NULL DEFAULT 0,
  stone_charge numeric(14,2) NOT NULL DEFAULT 0, other_charge numeric(14,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 3, quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0, line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(order_id);

-- ---------- permissions ----------
INSERT INTO permissions(key, module, resource, action) VALUES
  ('sales.invoice.confirm','Sales','invoice','confirm'),
  ('sales.invoice.return','Sales','invoice','return'),
  ('sales.invoice.price_override','Sales','invoice','price_override'),
  ('sales.invoice.discount','Sales','invoice','discount'),
  ('sales.invoice.record_payment','Sales','invoice','record_payment'),
  ('sales.order.confirm','Sales','order','confirm'),
  ('sales.order.convert_invoice','Sales','order','convert_invoice')
ON CONFLICT (key) DO NOTHING;

-- ---------- role grants ----------
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Master Admin' AND p.key IN ('sales.invoice.confirm','sales.invoice.return','sales.invoice.price_override','sales.invoice.discount','sales.invoice.record_payment','sales.order.confirm','sales.order.convert_invoice')
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Manager' AND p.key IN ('sales.invoice.confirm','sales.invoice.return','sales.invoice.price_override','sales.invoice.discount','sales.invoice.record_payment','sales.order.confirm','sales.order.convert_invoice')
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Sales Executive' AND p.key IN ('sales.invoice.confirm','sales.invoice.discount','sales.invoice.record_payment','sales.order.confirm')
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'POS / Cashier' AND p.key IN ('sales.invoice.confirm','sales.invoice.discount','sales.invoice.record_payment')
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Accounts User' AND p.key = 'sales.invoice.record_payment'
)
ON CONFLICT DO NOTHING;
