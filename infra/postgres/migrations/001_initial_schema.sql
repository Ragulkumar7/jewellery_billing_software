CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE IF NOT EXISTS sales_invoice_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS sales_order_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS purchase_order_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS purchase_invoice_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS expense_number_seq START 1001;

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, mobile text,
  email text, gst_number text, customer_type text NOT NULL DEFAULT 'Retail',
  billing_address text, shipping_address text, credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_balance numeric(14,2) NOT NULL DEFAULT 0, loyalty_points integer NOT NULL DEFAULT 0,
  total_purchases numeric(14,2) NOT NULL DEFAULT 0, notes text, shopify_customer_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopify_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shopify_customer_id text NOT NULL UNIQUE,
  name text NOT NULL, mobile text, email text, total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric(14,2) NOT NULL DEFAULT 0, synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE, barcode text UNIQUE,
  name text NOT NULL, category text NOT NULL DEFAULT 'Silver', collection text,
  purity text NOT NULL DEFAULT '92.5', gross_weight numeric(12,3) NOT NULL DEFAULT 0,
  net_weight numeric(12,3) NOT NULL DEFAULT 0, stone_weight numeric(12,3) NOT NULL DEFAULT 0,
  making_charge numeric(14,2) NOT NULL DEFAULT 0, stone_charge numeric(14,2) NOT NULL DEFAULT 0,
  other_charge numeric(14,2) NOT NULL DEFAULT 0, hallmark text, gst_rate numeric(5,2) NOT NULL DEFAULT 3,
  stock_qty integer NOT NULL DEFAULT 0 CHECK (stock_qty >= 0), reserved_qty integer NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  sold_qty integer NOT NULL DEFAULT 0, min_stock_qty integer NOT NULL DEFAULT 5, status text NOT NULL DEFAULT 'Active',
  shopify_product_id text, shopify_variant_id text, shopify_sync_status text NOT NULL DEFAULT 'Not Synced',
  shopify_last_sync timestamptz, stock_updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS silver_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purity text NOT NULL DEFAULT '92.5', rate_per_gram numeric(14,2) NOT NULL,
  effective_date date NOT NULL DEFAULT current_date, effective_time time NOT NULL DEFAULT current_time,
  updated_by uuid REFERENCES users(id), remarks text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text NOT NULL UNIQUE DEFAULT ('SO-' || to_char(current_date, 'YYYY') || '-' || nextval('sales_order_number_seq')), customer_id uuid REFERENCES customers(id),
  status text NOT NULL DEFAULT 'Draft', order_date date NOT NULL DEFAULT current_date, advance_amount numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0, notes text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL UNIQUE DEFAULT ('SI-' || to_char(current_date, 'YYYY') || '-' || nextval('sales_invoice_number_seq')), customer_id uuid REFERENCES customers(id),
   customer_name text NOT NULL, customer_mobile text, invoice_type text NOT NULL DEFAULT 'Tax Invoice',
  invoice_date date NOT NULL DEFAULT current_date, due_date date, salesperson_id uuid REFERENCES users(id), status text NOT NULL DEFAULT 'Unpaid',
  payment_status text NOT NULL DEFAULT 'Unpaid', payment_method text, subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0, gst_amount numeric(14,2) NOT NULL DEFAULT 0, round_off numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0, amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_balance numeric(14,2) NOT NULL DEFAULT 0, silver_rate numeric(14,2) NOT NULL DEFAULT 0, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id), sku text, name text NOT NULL, purity text, gross_weight numeric(12,3) NOT NULL DEFAULT 0,
  net_weight numeric(12,3) NOT NULL DEFAULT 0, stone_weight numeric(12,3) NOT NULL DEFAULT 0, silver_rate numeric(14,2) NOT NULL DEFAULT 0,
  making_charge numeric(14,2) NOT NULL DEFAULT 0, stone_charge numeric(14,2) NOT NULL DEFAULT 0, other_charge numeric(14,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 3, quantity integer NOT NULL CHECK (quantity > 0), unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id), movement_type text NOT NULL,
  quantity_change integer NOT NULL, resulting_qty integer NOT NULL, reference text, reference_type text, notes text,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, contact_person text, mobile text, email text,
  address text, gst_number text, pan text, payment_terms text NOT NULL DEFAULT 'Immediate', credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_balance numeric(14,2) NOT NULL DEFAULT 0, total_purchases numeric(14,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_number text NOT NULL UNIQUE, supplier_id uuid REFERENCES suppliers(id),
  status text NOT NULL DEFAULT 'Draft', po_date date NOT NULL DEFAULT current_date, expected_delivery date, grand_total numeric(14,2) NOT NULL DEFAULT 0,
  notes text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pi_number text NOT NULL UNIQUE, supplier_id uuid REFERENCES suppliers(id),
  supplier_invoice_number text, status text NOT NULL DEFAULT 'Draft', payment_status text NOT NULL DEFAULT 'Unpaid',
  pi_date date NOT NULL DEFAULT current_date, due_date date, subtotal numeric(14,2) NOT NULL DEFAULT 0, gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0, amount_paid numeric(14,2) NOT NULL DEFAULT 0, outstanding_balance numeric(14,2) NOT NULL DEFAULT 0,
  notes text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), expense_number text NOT NULL UNIQUE, category text NOT NULL, expense_date date NOT NULL DEFAULT current_date,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0), payment_method text NOT NULL, description text, receipt_url text, remarks text,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_number text NOT NULL UNIQUE, direction text NOT NULL,
  payment_type text NOT NULL, party_name text, party_id uuid, reference text, amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL, status text NOT NULL DEFAULT 'Completed', notes text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_date date NOT NULL DEFAULT current_date, transaction_type text NOT NULL,
  reference text, debit numeric(14,2) NOT NULL DEFAULT 0, credit numeric(14,2) NOT NULL DEFAULT 0, description text,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sync_type text NOT NULL, entity_id uuid, entity_name text, shopify_id text,
  status text NOT NULL DEFAULT 'Pending', error_message text, attempts integer NOT NULL DEFAULT 0, synced_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), module text NOT NULL, action text NOT NULL,
  record_id uuid, record_type text, status text NOT NULL DEFAULT 'Success', previous_value jsonb, new_value jsonb, remarks text,
  ip_address inet, device_info text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), setting_key text NOT NULL UNIQUE, setting_group text NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
