-- 012_purchase_module.sql
-- Purchases Module (Final Requirement):
--   * full document separation: Purchase Order → GRN → Purchase Invoice → Inventory → Accounts
--   * new tables: po_items, grns/grn_items, pi_items, purchase_returns/pr_items
--   * PO/PI get totals + approval/cancellation audit columns; suppliers get status + bank details
--   * permission purchase.supplier.deactivate

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS pi_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS grn_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS pr_number_seq START 1001;

-- ---------- suppliers ----------
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account_no text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_ifsc text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);

-- ---------- purchase_orders ----------
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS gst_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS round_off numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE purchase_orders ALTER COLUMN po_number SET DEFAULT ('PO-' || to_char(current_date, 'YYYY') || '-' || nextval('po_number_seq'));
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

-- ---------- po_items (what we ordered) ----------
CREATE TABLE IF NOT EXISTS po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  sku text, name text NOT NULL, purity text, unit text NOT NULL DEFAULT 'pcs',
  gross_weight numeric(12,3) NOT NULL DEFAULT 0, net_weight numeric(12,3) NOT NULL DEFAULT 0, stone_weight numeric(12,3) NOT NULL DEFAULT 0,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON po_items(po_id);

-- ---------- GRN (what we actually received) ----------
CREATE TABLE IF NOT EXISTS grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number text NOT NULL UNIQUE DEFAULT ('GRN-' || to_char(current_date, 'YYYY') || '-' || nextval('grn_number_seq')),
  po_id uuid REFERENCES purchase_orders(id),
  supplier_id uuid REFERENCES suppliers(id),
  status text NOT NULL DEFAULT 'Draft',
  grn_date date NOT NULL DEFAULT current_date,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS grn_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES po_items(id),
  product_id uuid REFERENCES products(id),
  sku text, name text NOT NULL, purity text, unit text NOT NULL DEFAULT 'pcs',
  expected_qty numeric(14,3) NOT NULL DEFAULT 0,
  received_qty numeric(14,3) NOT NULL CHECK (received_qty >= 0),
  gross_weight numeric(12,3) NOT NULL DEFAULT 0, net_weight numeric(12,3) NOT NULL DEFAULT 0, stone_weight numeric(12,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grn_supplier ON grns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_status ON grns(status);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id);

-- ---------- purchase_invoices (what the supplier billed us) ----------
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES purchase_orders(id);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS grn_id uuid REFERENCES grns(id);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS round_off numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS discount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE purchase_invoices ALTER COLUMN pi_number SET DEFAULT ('PINV-' || to_char(current_date, 'YYYY') || '-' || nextval('pi_number_seq'));
CREATE INDEX IF NOT EXISTS idx_pi_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON purchase_invoices(status);

CREATE TABLE IF NOT EXISTS pi_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  sku text, name text NOT NULL, quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0, line_total numeric(14,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 3, gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pi_items_pi ON pi_items(pi_id);

-- ---------- purchase_returns ----------
CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE DEFAULT ('PR-' || to_char(current_date, 'YYYY') || '-' || nextval('pr_number_seq')),
  supplier_id uuid REFERENCES suppliers(id),
  grn_id uuid REFERENCES grns(id),
  invoice_id uuid REFERENCES purchase_invoices(id),
  return_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'Draft',
  reason text, remarks text,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS pr_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  grn_item_id uuid REFERENCES grn_items(id),
  product_id uuid REFERENCES products(id),
  sku text, name text NOT NULL, quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0, line_total numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pr_return ON pr_items(return_id);

-- ---------- permissions ----------
INSERT INTO permissions(key, module, resource, action) VALUES
  ('purchase.supplier.deactivate','Purchases','supplier','deactivate')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name IN ('Master Admin', 'Manager', 'Purchase User') AND p.key = 'purchase.supplier.deactivate'
)
ON CONFLICT DO NOTHING;
