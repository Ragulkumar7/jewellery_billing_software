/*
# Purchase Module Schema

Single-tenant schema for procurement: suppliers, purchase orders, goods receipt notes,
purchase invoices, purchase returns, and supplier payments. No sign-in required, so policies
are scoped to anon + authenticated and the data is intentionally shared/public.

1. New Tables
- `suppliers` — supplier master: contact, GST, bank, payment terms, credit limit, performance metrics.
- `purchase_orders` — PO header: auto-number, supplier, dates, status, totals, approval workflow.
- `po_items` — line items per PO capturing jewellery weight/purity/charge details.
- `purchase_invoices` — supplier invoice header with PO/GRN reference, GST, totals, payment status.
- `pi_items` — line items per purchase invoice.
- `grns` — goods receipt note header: against PO, warehouse, batch, inspection status.
- `grn_items` — received items with weight verification (gross/net/stone) and quality checks.
- `purchase_returns` — returns to supplier against GRN or invoice, refund type, reason.
- `pr_items` — items returned per purchase return.
- `supplier_payments` — payments to suppliers: method, amount, advance/partial/full, reference.

2. Security
- RLS enabled on every table.
- CRUD policies for anon + authenticated (no-auth, single-tenant app).

3. Notes
- PO/PI/GRN/PR numbers auto-generated via shared sequence `purchase_doc_seq`.
- All monetary columns numeric(14,2). Weights numeric(12,3) grams.
- PO status tracks the workflow: Draft -> Pending Approval -> Approved -> Sent -> Partially Received -> Fully Received -> Closed / Cancelled.
- GRN approval updates inventory (stock_qty on products) via the app layer.
*/

CREATE SEQUENCE IF NOT EXISTS purchase_doc_seq START 5001;

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  mobile text,
  email text,
  address text,
  gst_number text,
  pan text,
  bank_details text,
  payment_terms text DEFAULT 'Net 30',
  credit_limit numeric(14,2) DEFAULT 0,
  outstanding_balance numeric(14,2) DEFAULT 0,
  total_purchases numeric(14,2) DEFAULT 0,
  delivery_performance numeric(5,2) DEFAULT 95.00,
  return_percentage numeric(5,2) DEFAULT 2.00,
  product_quality integer DEFAULT 5,
  category text DEFAULT 'Silver',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL DEFAULT ('PO-2026-' || nextval('purchase_doc_seq')),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT 'Unknown Supplier',
  po_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery date,
  delivery_address text,
  warehouse text DEFAULT 'Main Warehouse',
  payment_terms text DEFAULT 'Net 30',
  currency text DEFAULT 'INR',
  status text NOT NULL DEFAULT 'Draft',
  subtotal numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  additional_charges numeric(14,2) DEFAULT 0,
  gst_amount numeric(14,2) DEFAULT 0,
  grand_total numeric(14,2) DEFAULT 0,
  notes text,
  created_by text DEFAULT 'Humend Admin',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  category text,
  purity text DEFAULT '92.5',
  weight numeric(12,3) DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  expected_silver_rate numeric(14,2),
  making_charge numeric(14,2) DEFAULT 0,
  stone_charge numeric(14,2) DEFAULT 0,
  line_total numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_number text NOT NULL DEFAULT ('PI-2026-' || nextval('purchase_doc_seq')),
  supplier_invoice_number text,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT 'Unknown Supplier',
  pi_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  po_reference text,
  grn_reference text,
  status text NOT NULL DEFAULT 'Draft',
  payment_status text NOT NULL DEFAULT 'Unpaid',
  subtotal numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  gst_amount numeric(14,2) DEFAULT 0,
  grand_total numeric(14,2) DEFAULT 0,
  amount_paid numeric(14,2) DEFAULT 0,
  outstanding_balance numeric(14,2) DEFAULT 0,
  silver_weight numeric(12,3) DEFAULT 0,
  silver_rate numeric(14,2) DEFAULT 0,
  making_charges numeric(14,2) DEFAULT 0,
  stone_charges numeric(14,2) DEFAULT 0,
  hallmark_charges numeric(14,2) DEFAULT 0,
  labour_charges numeric(14,2) DEFAULT 0,
  other_charges numeric(14,2) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pi_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number text NOT NULL DEFAULT ('GRN-2026-' || nextval('purchase_doc_seq')),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  po_number text,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT 'Unknown Supplier',
  grn_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse text DEFAULT 'Main Warehouse',
  batch_number text,
  inspection_status text NOT NULL DEFAULT 'Pending',
  status text NOT NULL DEFAULT 'Draft',
  total_qty integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grn_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES po_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  ordered_qty integer DEFAULT 0,
  received_qty integer NOT NULL DEFAULT 0,
  damaged_qty integer DEFAULT 0,
  gross_weight numeric(12,3) DEFAULT 0,
  net_weight numeric(12,3) DEFAULT 0,
  stone_weight numeric(12,3) DEFAULT 0,
  purity_check text DEFAULT 'Pass',
  hallmark_verification text DEFAULT 'Pass',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text NOT NULL DEFAULT ('PR-2026-' || nextval('purchase_doc_seq')),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT 'Unknown Supplier',
  grn_reference text,
  invoice_reference text,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  return_type text NOT NULL DEFAULT 'Full',
  refund_type text NOT NULL DEFAULT 'Credit Note',
  reason text,
  subtotal numeric(14,2) DEFAULT 0,
  gst_amount numeric(14,2) DEFAULT 0,
  grand_total numeric(14,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'Processed',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pr_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL DEFAULT ('SP-2026-' || nextval('purchase_doc_seq')),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'Bank Transfer',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'Full',
  reference text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_pi_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_pi_items_pi ON pi_items(pi_id);
CREATE INDEX IF NOT EXISTS idx_grns_po ON grns(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_pr_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_pr ON pr_items(pr_id);
CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_payments(supplier_id);

-- RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pi_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','purchase_orders','po_items','purchase_invoices','pi_items','grns','grn_items','purchase_returns','pr_items','supplier_payments'] LOOP
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
