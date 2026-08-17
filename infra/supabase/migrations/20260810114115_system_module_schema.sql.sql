/*
# System Module — Users, Roles, Activity Log, Settings

Single-tenant schema for the Opal Line Jewelry system administration module.
No sign-in screen is required, so policies are scoped to anon + authenticated.

## 1. New Tables
- `system_users` — application users with role assignments (not auth.users; this is for UI/role display only).
  Columns: name, username, email, role, status, last_login, created_at.
- `system_roles` — predefined and custom role definitions with permission matrix stored as JSONB.
  Columns: name, description, permissions (jsonb), is_system (bool).
- `activity_log` — audit trail of every important action in the system.
  Columns: user_name, module, action, record_id, record_type, status, previous_value, new_value, remarks, ip_address, device_info, created_at.
- `system_settings` — key-value configuration store for business, invoice, tax, payment, inventory, silver rate, Shopify, and notification settings.
  Columns: setting_key, setting_group, setting_value (jsonb), description.

## 2. Security
- RLS enabled on every new table.
- CRUD policies for anon + authenticated (no-auth, single-tenant app; data is intentionally shared).

## 3. Notes
- `system_users` is for display/role management only — it does not control actual authentication.
- `system_roles.permissions` stores a JSONB object mapping module names to permission arrays (e.g. {"Sales Invoice": ["view","create","edit","delete","print","export"]}).
- `activity_log` captures before/after values for sensitive changes like silver rate updates, price overrides, and invoice cancellations.
- `system_settings` uses a group + key structure so the Settings UI can render organized sections.
*/

CREATE TABLE IF NOT EXISTS system_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'Sales User',
  status text NOT NULL DEFAULT 'Active',
  last_login timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL DEFAULT 'System',
  module text NOT NULL,
  action text NOT NULL,
  record_id text,
  record_type text,
  status text NOT NULL DEFAULT 'Success',
  previous_value text,
  new_value text,
  remarks text,
  ip_address text,
  device_info text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_module ON activity_log(module);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_name);

CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_group text NOT NULL DEFAULT 'Business',
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['system_users','system_roles','activity_log','system_settings'] LOOP
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

-- Seed system roles
INSERT INTO system_roles (name, description, permissions, is_system) VALUES
  ('Master Admin', 'Full system access to all modules and settings.', '{"all": ["view","create","edit","delete","print","export","approve","publish"]}'::jsonb, true),
  ('Manager', 'Access to Sales, Purchases, Inventory, Reports, Customers, Suppliers.', '{"Sales": ["view","create","edit","delete","print","export"], "Purchases": ["view","create","edit","delete","print","export"], "Inventory": ["view","create","edit","delete","export"], "Reports": ["view","export","print"], "Customers": ["view","create","edit","delete"], "Suppliers": ["view","create","edit","delete"]}'::jsonb, true),
  ('Sales User', 'Access to Sales Invoices, Sales Orders, Customers.', '{"Sales Invoice": ["view","create","edit","print","export"], "Sales Order": ["view","create","edit"], "Customers": ["view","create","edit"]}'::jsonb, true),
  ('POS User', 'Access to POS/Billing and relevant customer information.', '{"POS Billing": ["view","create","edit"], "Customers": ["view","create"], "Sales Invoice": ["view","print"]}'::jsonb, true),
  ('Purchase User', 'Access to Purchase Orders, Purchase Invoices, Suppliers, Stock receiving.', '{"Purchase Orders": ["view","create","edit"], "Purchase Invoices": ["view","create","edit"], "Suppliers": ["view","create","edit"], "GRN": ["view","create","edit"]}'::jsonb, true),
  ('Accounts User', 'Access to Expenses, Payments, Purchase financial info, Ledger.', '{"Expenses": ["view","create","edit","delete","export"], "Payments": ["view","create","edit","delete","export"], "Purchase System": ["view","export"], "Ledger": ["view","export","print"]}'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

-- Seed system users
INSERT INTO system_users (name, username, email, role, status, last_login) VALUES
  ('Humend Admin', 'humend.admin', 'admin@opalline.in', 'Master Admin', 'Active', now()),
  ('Priya Sharma', 'priya.sharma', 'priya@opalline.in', 'Manager', 'Active', now() - interval '2 hours'),
  ('Rajesh Kumar', 'rajesh.kumar', 'rajesh@opalline.in', 'Sales User', 'Active', now() - interval '5 hours'),
  ('Anita Verma', 'anita.verma', 'anita@opalline.in', 'POS User', 'Active', now() - interval '1 hour'),
  ('Suresh Patel', 'suresh.patel', 'suresh@opalline.in', 'Purchase User', 'Active', now() - interval '3 hours'),
  ('Meera Iyer', 'meera.iyer', 'meera@opalline.in', 'Accounts User', 'Inactive', now() - interval '7 days'),
  ('Vikram Singh', 'vikram.singh', 'vikram@opalline.in', 'POS User', 'Active', now() - interval '30 minutes')
ON CONFLICT (username) DO NOTHING;

-- Seed activity log
INSERT INTO activity_log (user_name, module, action, record_id, record_type, status, previous_value, new_value, remarks) VALUES
  ('Humend Admin', 'Sync — Silver Rate', 'Changed Silver Rate', '₹92 → ₹94', 'Silver Rate', 'Success', '₹92.00 / gm', '₹94.00 / gm', 'Rate updated for 92.5 purity'),
  ('Rajesh Kumar', 'Sales', 'Created Sales Invoice', 'SI-2026-1025', 'Invoice', 'Success', '', '₹18,450', 'Tax Invoice for Rajesh Jewellers'),
  ('Suresh Patel', 'Purchases', 'Created Purchase Order', 'PO-2026-5082', 'Purchase Order', 'Success', '', '₹85,230', 'PO to Silvercraft Supplies'),
  ('Humend Admin', 'Sales', 'Approved Discount', 'SI-2026-1023', 'Invoice', 'Success', '5% → 8%', '8% discount approved', 'Manager approval for bulk order'),
  ('System', 'Sync — Shopify', 'Shopify Inventory Sync Failed', 'SKU: OPL-1024', 'Product', 'Failed', '', '', 'Connection timeout — retry scheduled'),
  ('Priya Sharma', 'Inventory', 'Stock Adjustment', 'OPL-BR-018', 'Product', 'Success', '12 pcs', '10 pcs', 'Manual adjustment — damaged item'),
  ('Anita Verma', 'POS Billing', 'Completed Sale', 'SI-2026-1026', 'Invoice', 'Success', '', '₹12,300', 'Cash sale — identified customer'),
  ('Humend Admin', 'Accounts', 'Recorded Payment', 'PAY-2026-1042', 'Payment', 'Success', '', '₹25,000', 'Incoming payment from Rajesh Jewellers'),
  ('System', 'Sync — Shopify', 'Product Sync Completed', 'OPL-CH-032', 'Product', 'Success', 'Not Synced', 'Synced', 'Product published to Shopify store'),
  ('Meera Iyer', 'Accounts', 'Created Expense', 'EXP-2026-1056', 'Expense', 'Success', '', '₹8,500', 'Rent payment for August 2026')
ON CONFLICT DO NOTHING;

-- Seed system settings
INSERT INTO system_settings (setting_key, setting_group, setting_value, description) VALUES
  ('business_name', 'Business', '{"value": "Opal Line Jewelry"}'::jsonb, 'Registered business name'),
  ('business_address', 'Business', '{"value": "Shop 12, Jewelry Market, Mumbai 400002"}'::jsonb, 'Business address'),
  ('business_contact', 'Business', '{"value": "+91 98765 43210"}'::jsonb, 'Primary contact number'),
  ('business_email', 'Business', '{"value": "contact@opalline.in"}'::jsonb, 'Business email address'),
  ('business_gst', 'Business', '{"value": "27ABCDE1234F1Z5"}'::jsonb, 'GST registration number'),
  ('invoice_prefix', 'Invoice', '{"value": "SI-2026-"}'::jsonb, 'Invoice number prefix'),
  ('invoice_starting_number', 'Invoice', '{"value": 1001}'::jsonb, 'Starting invoice number'),
  ('invoice_date_format', 'Invoice', '{"value": "DD-MM-YYYY"}'::jsonb, 'Date format on invoices'),
  ('invoice_terms', 'Invoice', '{"value": "Goods once sold will not be taken back. All disputes subject to Mumbai jurisdiction."}'::jsonb, 'Terms and conditions'),
  ('invoice_footer', 'Invoice', '{"value": "Thank you for your business!"}'::jsonb, 'Invoice footer text'),
  ('invoice_print_format', 'Invoice', '{"value": "A5 Thermal"}'::jsonb, 'Default print format'),
  ('gst_config', 'Tax', '{"enabled": true}'::jsonb, 'GST enabled/disabled'),
  ('gst_cgst_rate', 'Tax', '{"value": 1.5}'::jsonb, 'CGST rate percentage'),
  ('gst_sgst_rate', 'Tax', '{"value": 1.5}'::jsonb, 'SGST rate percentage'),
  ('gst_igst_rate', 'Tax', '{"value": 3.0}'::jsonb, 'IGST rate percentage'),
  ('gst_mode', 'Tax', '{"value": "Exclusive"}'::jsonb, 'Tax inclusive or exclusive'),
  ('payment_methods', 'Payment', '{"value": ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Other"]}'::jsonb, 'Supported payment methods'),
  ('low_stock_threshold', 'Inventory', '{"value": 5}'::jsonb, 'Default low stock threshold'),
  ('stock_adjustment_rules', 'Inventory', '{"value": "Requires Manager approval"}'::jsonb, 'Stock adjustment rules'),
  ('unit_of_measurement', 'Inventory', '{"value": "Grams"}'::jsonb, 'Default weight unit'),
  ('silver_rate_default_purity', 'Silver Rate', '{"value": "92.5"}'::jsonb, 'Default silver purity'),
  ('silver_rate_unit', 'Silver Rate', '{"value": "Per Gram"}'::jsonb, 'Rate unit'),
  ('silver_rate_rounding', 'Silver Rate', '{"value": "2 decimals"}'::jsonb, 'Rounding rule for silver rate'),
  ('silver_rate_approval', 'Silver Rate', '{"value": true}'::jsonb, 'Approval required for rate changes'),
  ('silver_rate_shopify_publish', 'Silver Rate', '{"value": false}'::jsonb, 'Auto-publish price changes to Shopify'),
  ('shopify_connection_status', 'Shopify', '{"value": "Connected"}'::jsonb, 'Shopify connection status'),
  ('shopify_product_sync', 'Shopify', '{"value": true}'::jsonb, 'Product sync enabled'),
  ('shopify_inventory_sync', 'Shopify', '{"value": true}'::jsonb, 'Inventory sync enabled'),
  ('shopify_order_sync', 'Shopify', '{"value": true}'::jsonb, 'Order sync enabled'),
  ('shopify_customer_sync', 'Shopify', '{"value": false}'::jsonb, 'Customer sync enabled'),
  ('shopify_price_sync', 'Shopify', '{"value": true}'::jsonb, 'Price synchronization enabled'),
  ('notif_low_stock', 'Notifications', '{"value": true}'::jsonb, 'Low stock notifications'),
  ('notif_shopify_sync_fail', 'Notifications', '{"value": true}'::jsonb, 'Shopify sync failure notifications'),
  ('notif_payment_due', 'Notifications', '{"value": true}'::jsonb, 'Payment due reminders'),
  ('notif_purchase_delivery', 'Notifications', '{"value": false}'::jsonb, 'Purchase delivery notifications'),
  ('notif_approval_requests', 'Notifications', '{"value": true}'::jsonb, 'Approval request notifications'),
  ('notif_silver_rate_update', 'Notifications', '{"value": true}'::jsonb, 'Silver rate update notifications')
ON CONFLICT (setting_key) DO NOTHING;
