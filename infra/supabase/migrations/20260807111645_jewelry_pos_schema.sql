/*
# Jewelry POS — Core Schema

Single-tenant schema for the Opal Line Jewelry POS/dashboard app. No sign-in screen is required,
so policies are scoped to `anon, authenticated` and the data is intentionally shared/public.

1. New Tables
- `silver_rates` — daily silver rate log (purity, rate per gram, effective date).
- `customers` — identified customer master, loyalty, contact, outstanding balance.
- `products` — jewellery product master: SKU, purity, gross/net/stone weight, making charges, stock.
- `invoices` — sales invoices (tax/retail/wholesale/proforma/estimate), status, payment, totals.
- `invoice_items` — line items per invoice capturing jewellery pricing details for audit.
- `held_bills` — on-hold POS transactions (resume later), JSONB cart payload, auto-expiry.
- `sales_returns` — returns against invoices (full/partial, refund/exchange/credit note).
- `return_items` — items returned per sales return.
- `shifts` — cashier shift open/close with cash drawer reconciliation.

2. Security
- RLS enabled on every table.
- CRUD policies for `anon, authenticated` (no-auth, single-tenant app; data is intentionally shared).

3. Notes
- All monetary columns are numeric(14,2). Weights are numeric(12,3) grams.
- Invoices auto-generate a readable invoice_number via a sequence-backed default.
- Silver rate is stored on invoice_items at sale time for future audit/price verification.
*/

CREATE TABLE IF NOT EXISTS silver_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purity text NOT NULL DEFAULT '92.5',
  rate_per_gram numeric(14,2) NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text,
  email text,
  gst_number text,
  customer_type text NOT NULL DEFAULT 'Retail', -- Retail / Wholesale / Walk-in
  billing_address text,
  shipping_address text,
  credit_limit numeric(14,2) DEFAULT 0,
  outstanding_balance numeric(14,2) DEFAULT 0,
  loyalty_points integer DEFAULT 0,
  total_purchases numeric(14,2) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Silver',
  collection text,
  purity text NOT NULL DEFAULT '92.5',
  gross_weight numeric(12,3) NOT NULL DEFAULT 0,
  net_weight numeric(12,3) NOT NULL DEFAULT 0,
  stone_weight numeric(12,3) NOT NULL DEFAULT 0,
  making_charge numeric(14,2) NOT NULL DEFAULT 0,
  stone_charge numeric(14,2) NOT NULL DEFAULT 0,
  other_charge numeric(14,2) NOT NULL DEFAULT 0,
  hallmark text,
  gst_rate numeric(5,2) NOT NULL DEFAULT 3.00,
  stock_qty integer NOT NULL DEFAULT 0,
  min_stock_qty integer NOT NULL DEFAULT 5,
  image_url text,
  created_at timestamptz DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL DEFAULT ('SI-2026-' || nextval('invoice_number_seq')),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_mobile text,
  invoice_type text NOT NULL DEFAULT 'Tax Invoice', -- Tax Invoice / Retail / Wholesale / Proforma / Estimate / Credit
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  salesperson text NOT NULL DEFAULT 'Staff',
  salesperson_id uuid,
  status text NOT NULL DEFAULT 'Draft', -- Draft / Pending Approval / Approved / Paid / Partially Paid / Unpaid / Overdue / Cancelled / Returned
  payment_status text NOT NULL DEFAULT 'Unpaid', -- Unpaid / Paid / Partially Paid
  payment_method text, -- Cash / UPI / Card / Bank Transfer / Mixed / Credit
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  round_off numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_balance numeric(14,2) NOT NULL DEFAULT 0,
  silver_rate numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  category text,
  purity text DEFAULT '92.5',
  gross_weight numeric(12,3) DEFAULT 0,
  net_weight numeric(12,3) DEFAULT 0,
  stone_weight numeric(12,3) DEFAULT 0,
  silver_rate numeric(14,2) NOT NULL DEFAULT 0,
  making_charge numeric(14,2) DEFAULT 0,
  stone_charge numeric(14,2) DEFAULT 0,
  other_charge numeric(14,2) DEFAULT 0,
  gst_rate numeric(5,2) DEFAULT 3.00,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS held_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL DEFAULT ('HOLD-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6))),
  customer_name text NOT NULL,
  cart jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(14,2) DEFAULT 0,
  grand_total numeric(14,2) DEFAULT 0,
  staff_name text NOT NULL DEFAULT 'Staff',
  notes text,
  status text NOT NULL DEFAULT 'Held', -- Held / Resumed / Expired
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL DEFAULT ('SR-2026-' || nextval('invoice_number_seq')),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  return_type text NOT NULL DEFAULT 'Full', -- Full / Partial
  refund_type text NOT NULL DEFAULT 'Refund', -- Refund / Exchange / Credit Note
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  reason text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Processed', -- Processed / Pending
  processed_by text NOT NULL DEFAULT 'Staff',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  invoice_item_id uuid REFERENCES invoice_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name text NOT NULL DEFAULT 'Staff',
  shift_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_cash numeric(14,2) NOT NULL DEFAULT 0,
  cash_sales numeric(14,2) NOT NULL DEFAULT 0,
  card_sales numeric(14,2) NOT NULL DEFAULT 0,
  upi_sales numeric(14,2) NOT NULL DEFAULT 0,
  expenses numeric(14,2) NOT NULL DEFAULT 0,
  withdrawals numeric(14,2) NOT NULL DEFAULT 0,
  closing_cash numeric(14,2) NOT NULL DEFAULT 0,
  cash_difference numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Open', -- Open / Closed
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_silver_rates_date ON silver_rates(effective_date DESC);

-- RLS
ALTER TABLE silver_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE held_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Helper to apply CRUD policies for anon+authenticated on a table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['silver_rates','customers','products','invoices','invoice_items','held_bills','sales_returns','return_items','shifts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "anon_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "anon_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "anon_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "anon_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
  END LOOP;
END $$;
