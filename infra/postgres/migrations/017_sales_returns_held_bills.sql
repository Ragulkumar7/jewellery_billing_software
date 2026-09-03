-- 017_sales_returns_held_bills.sql
-- Batch 1: Sales Returns + Held Bills.
--   * new tables: sales_returns / return_items, held_bills
--   * sequences for SR (sales return) and HB (held bill) references
--   * permissions + role grants for sales returns and held bills

-- ---------- sequences ----------
CREATE SEQUENCE IF NOT EXISTS sr_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS held_bill_seq START 1001;

-- ---------- sales_returns ----------
CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE DEFAULT ('SR-' || to_char(current_date, 'YYYY') || '-' || nextval('sr_number_seq')),
  invoice_id uuid REFERENCES invoices(id),
  return_type text NOT NULL DEFAULT 'Partial',
  refund_type text NOT NULL DEFAULT 'Refund',
  return_date date NOT NULL DEFAULT current_date,
  customer_id uuid REFERENCES customers(id),
  customer_name text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'Processed',
  processed_by text,
  created_by uuid REFERENCES users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_status_check CHECK (status IN ('Processed', 'Cancelled'));

CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  invoice_item_id uuid REFERENCES invoice_items(id),
  product_id uuid REFERENCES products(id),
  sku text,
  name text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date DESC);

-- ---------- held_bills ----------
CREATE TABLE IF NOT EXISTS held_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('HB-' || to_char(current_date, 'YYYY') || '-' || nextval('held_bill_seq')),
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL DEFAULT 'Walk-in Customer',
  cart jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  staff_name text,
  notes text,
  status text NOT NULL DEFAULT 'Held',
  expires_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resumed_at timestamptz,
  resumed_by uuid REFERENCES users(id)
);
ALTER TABLE held_bills ADD CONSTRAINT held_bills_status_check CHECK (status IN ('Held', 'Resumed', 'Expired'));
CREATE INDEX IF NOT EXISTS idx_held_bills_status ON held_bills(status);

-- ---------- permissions ----------
INSERT INTO permissions(key, module, resource, action) VALUES
  ('sales.return.view','Sales','return','view'),
  ('sales.return.create','Sales','return','create'),
  ('sales.return.process','Sales','return','process'),
  ('sales.heldbill.view','Sales','heldbill','view'),
  ('sales.heldbill.create','Sales','heldbill','create'),
  ('sales.heldbill.resume','Sales','heldbill','resume')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Master Admin' AND p.key IN (
    'sales.return.view','sales.return.create','sales.return.process',
    'sales.heldbill.view','sales.heldbill.create','sales.heldbill.resume'
  )
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Manager' AND p.key IN (
    'sales.return.view','sales.return.create','sales.return.process',
    'sales.heldbill.view','sales.heldbill.create','sales.heldbill.resume'
  )
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name IN ('Sales Executive', 'POS / Cashier') AND p.key IN (
    'sales.return.view','sales.return.create',
    'sales.heldbill.view','sales.heldbill.create','sales.heldbill.resume'
  )
)
ON CONFLICT DO NOTHING;
