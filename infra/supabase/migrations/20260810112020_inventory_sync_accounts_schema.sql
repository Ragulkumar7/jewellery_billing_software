/*
# Inventory, Sync & Accounts Schema

Single-tenant schema additions for the Opal Line Jewelry system. No sign-in required,
so policies are scoped to anon + authenticated and data is intentionally shared/public.

## 1. Modified Tables
- `products` — added columns for barcode, reserved/sold stock, Shopify sync, product status, last stock update.
  - barcode text
  - reserved_qty integer DEFAULT 0
  - sold_qty integer DEFAULT 0
  - status text DEFAULT 'Active' (Active / Inactive)
  - shopify_product_id text
  - shopify_variant_id text
  - shopify_sync_status text DEFAULT 'Not Synced' (Synced / Pending / Processing / Failed / Not Synced)
  - shopify_last_sync timestamptz
  - stock_updated_at timestamptz DEFAULT now()

## 2. New Tables
- `stock_history` — tracks every stock movement per product with reason and reference.
- `shopify_sync_log` — log of all sync operations (product, inventory, order) with status and error.
- `expenses` — business expense records with category, payment method, reference.
- `expense_categories` — configurable expense categories.
- `payments` — money received and paid (incoming/outgoing) with type, method, reference.
- `silver_rate_history` — tracks every silver rate change with previous rate, new rate, updated by, remarks.

## 3. Security
- RLS enabled on every new table.
- CRUD policies for anon + authenticated (no-auth, single-tenant app).
*/

-- Add columns to products (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='barcode') THEN
    ALTER TABLE products ADD COLUMN barcode text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='reserved_qty') THEN
    ALTER TABLE products ADD COLUMN reserved_qty integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sold_qty') THEN
    ALTER TABLE products ADD COLUMN sold_qty integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='status') THEN
    ALTER TABLE products ADD COLUMN status text NOT NULL DEFAULT 'Active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='shopify_product_id') THEN
    ALTER TABLE products ADD COLUMN shopify_product_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='shopify_variant_id') THEN
    ALTER TABLE products ADD COLUMN shopify_variant_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='shopify_sync_status') THEN
    ALTER TABLE products ADD COLUMN shopify_sync_status text NOT NULL DEFAULT 'Not Synced';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='shopify_last_sync') THEN
    ALTER TABLE products ADD COLUMN shopify_last_sync timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stock_updated_at') THEN
    ALTER TABLE products ADD COLUMN stock_updated_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stock_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type text NOT NULL, -- Opening / Purchase / Stock Received / Sale / Return / Adjustment
  quantity_change integer NOT NULL DEFAULT 0,
  resulting_qty integer NOT NULL DEFAULT 0,
  reference text,
  reference_type text, -- PO / GRN / Invoice / SR / Manual
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_history_product ON stock_history(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shopify_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL, -- Product / Inventory / Order / Customer
  entity_id text,
  entity_name text,
  shopify_id text,
  status text NOT NULL DEFAULT 'Pending', -- Synced / Pending / Processing / Failed / Retrying / Manual Action Required
  error_message text,
  attempts integer DEFAULT 0,
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_log_status ON shopify_sync_log(status);

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS expense_number_seq START 1001;

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text NOT NULL DEFAULT ('EXP-2026-' || nextval('expense_number_seq')),
  category text NOT NULL DEFAULT 'Other',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  reference_number text,
  description text,
  attachment_url text,
  remarks text,
  status text NOT NULL DEFAULT 'Approved',
  created_by text DEFAULT 'Humend Admin',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1001;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL DEFAULT ('PAY-2026-' || nextval('payment_number_seq')),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  direction text NOT NULL DEFAULT 'Incoming', -- Incoming / Outgoing
  payment_type text NOT NULL, -- Customer Payment / Invoice Payment / Advance Payment / Supplier Payment / Expense Payment / Refund
  party_name text,
  party_type text, -- Customer / Supplier
  reference text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash', -- Cash / UPI / Card / Bank Transfer / Cheque / Other
  status text NOT NULL DEFAULT 'Completed',
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);

CREATE TABLE IF NOT EXISTS silver_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purity text NOT NULL DEFAULT '92.5',
  previous_rate numeric(14,2) NOT NULL DEFAULT 0,
  new_rate numeric(14,2) NOT NULL DEFAULT 0,
  rate_change numeric(14,2) NOT NULL DEFAULT 0,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  effective_time time NOT NULL DEFAULT CURRENT_TIME,
  remarks text,
  updated_by text DEFAULT 'Humend Admin',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_silver_rate_history_date ON silver_rate_history(effective_date DESC);

-- RLS
ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver_rate_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_history','shopify_sync_log','expense_categories','expenses','payments','silver_rate_history'] LOOP
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

-- Seed expense categories
INSERT INTO expense_categories (name, description) VALUES
  ('Rent', 'Shop or office rent'),
  ('Electricity', 'Electricity bills'),
  ('Salary', 'Staff salaries and wages'),
  ('Transport', 'Transportation and courier'),
  ('Maintenance', 'Equipment and shop maintenance'),
  ('Packaging', 'Packaging materials'),
  ('Marketing', 'Advertising and marketing expenses'),
  ('Office Expenses', 'Stationery, supplies, and miscellaneous office costs'),
  ('Other', 'Miscellaneous expenses')
ON CONFLICT (name) DO NOTHING;