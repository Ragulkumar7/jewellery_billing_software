-- Identity and authorization foundation. This migration is additive so existing
-- business data and the first schema migration remain usable.

ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(lower(username)) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  module text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'branch', 'warehouse', 'own', 'team')),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device text,
  browser text,
  ip_address inet,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS permissions_module_idx ON permissions(module);

INSERT INTO roles (name, description, is_system) VALUES
  ('Master Admin', 'Full system control, security administration, and audit access.', true),
  ('Manager', 'Broad operational and management access without security administration.', true),
  ('Sales Executive', 'Sales invoices, orders, and customer management.', true),
  ('POS / Cashier', 'Focused point-of-sale billing and receipt access.', true),
  ('Purchase User', 'Purchase orders, receiving, suppliers, and purchase returns.', true),
  ('Inventory User', 'Product and inventory visibility with controlled adjustments.', true),
  ('Accounts User', 'Expenses, payments, purchase financial information, and ledger.', true)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

WITH definition(key, module, resource, action) AS (VALUES
  ('dashboard.view','Dashboard','dashboard','view'),
  ('sales.invoice.view','Sales','invoice','view'), ('sales.invoice.create','Sales','invoice','create'), ('sales.invoice.edit','Sales','invoice','edit'), ('sales.invoice.cancel','Sales','invoice','cancel'), ('sales.invoice.print','Sales','invoice','print'), ('sales.invoice.export','Sales','invoice','export'), ('sales.invoice.approve','Sales','invoice','approve'),
  ('sales.order.view','Sales','order','view'), ('sales.order.create','Sales','order','create'), ('sales.order.edit','Sales','order','edit'), ('sales.order.cancel','Sales','order','cancel'),
  ('sales.customer.view','Sales','customer','view'), ('sales.customer.create','Sales','customer','create'), ('sales.customer.edit','Sales','customer','edit'),
  ('sales.return.view','Sales','return','view'), ('sales.return.create','Sales','return','create'), ('sales.return.approve','Sales','return','approve'), ('sales.return.refund','Sales','return','refund'),
  ('purchase.order.view','Purchases','order','view'), ('purchase.order.create','Purchases','order','create'), ('purchase.order.edit','Purchases','order','edit'), ('purchase.order.approve','Purchases','order','approve'), ('purchase.order.cancel','Purchases','order','cancel'),
  ('purchase.invoice.view','Purchases','invoice','view'), ('purchase.invoice.create','Purchases','invoice','create'), ('purchase.invoice.edit','Purchases','invoice','edit'), ('purchase.invoice.approve','Purchases','invoice','approve'),
  ('purchase.grn.view','Purchases','grn','view'), ('purchase.grn.create','Purchases','grn','create'), ('purchase.grn.approve','Purchases','grn','approve'),
  ('purchase.supplier.view','Purchases','supplier','view'), ('purchase.supplier.create','Purchases','supplier','create'), ('purchase.supplier.edit','Purchases','supplier','edit'),
  ('purchase.return.view','Purchases','return','view'), ('purchase.return.create','Purchases','return','create'), ('purchase.return.approve','Purchases','return','approve'),
  ('inventory.product.view','Inventory','product','view'), ('inventory.product.create','Inventory','product','create'), ('inventory.product.edit','Inventory','product','edit'), ('inventory.product.archive','Inventory','product','archive'),
  ('inventory.stock.view','Inventory','stock','view'), ('inventory.stock.adjust','Inventory','stock','adjust'), ('inventory.stock.export','Inventory','stock','export'), ('inventory.low_stock.view','Inventory','low_stock','view'),
  ('sync.shopify.view','Sync','shopify','view'), ('sync.shopify.execute','Sync','shopify','execute'), ('sync.shopify.retry','Sync','shopify','retry'),
  ('silver_rate.view','Sync','silver_rate','view'), ('silver_rate.update','Sync','silver_rate','update'), ('silver_rate.approve','Sync','silver_rate','approve'), ('silver_rate.publish','Sync','silver_rate','publish'),
  ('accounts.expense.view','Accounts','expense','view'), ('accounts.expense.create','Accounts','expense','create'), ('accounts.expense.edit','Accounts','expense','edit'), ('accounts.expense.approve','Accounts','expense','approve'),
  ('accounts.payment.view','Accounts','payment','view'), ('accounts.payment.create','Accounts','payment','create'), ('accounts.payment.edit','Accounts','payment','edit'), ('accounts.purchase.view','Accounts','purchase','view'), ('accounts.ledger.view','Accounts','ledger','view'), ('accounts.ledger.export','Accounts','ledger','export'),
  ('reports.sales.view','Reports','sales','view'), ('reports.business.view','Reports','business','view'), ('reports.gst.view','Reports','gst','view'), ('reports.analytics.view','Reports','analytics','view'), ('reports.inventory.view','Reports','inventory','view'), ('reports.export','Reports','reports','export'),
  ('system.users.view','System','users','view'), ('system.users.create','System','users','create'), ('system.users.edit','System','users','edit'), ('system.users.disable','System','users','disable'), ('system.roles.view','System','roles','view'), ('system.roles.create','System','roles','create'), ('system.roles.edit','System','roles','edit'), ('system.roles.delete','System','roles','delete'), ('system.permissions.view','System','permissions','view'), ('system.permissions.manage','System','permissions','manage'), ('system.settings.view','System','settings','view'), ('system.settings.edit','System','settings','edit'), ('system.activity_logs.view','System','activity_logs','view'), ('system.activity_logs.export','System','activity_logs','export')
)
INSERT INTO permissions(key, module, resource, action)
SELECT key, module, resource, action FROM definition ON CONFLICT (key) DO NOTHING;

INSERT INTO user_roles(user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.id = u.role_id
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Master Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  (r.name = 'Manager' AND (p.module IN ('Dashboard','Sales','Purchases','Inventory','Accounts','Reports') OR p.key IN ('silver_rate.view','silver_rate.update','silver_rate.approve','silver_rate.publish','sync.shopify.view')))
  OR (r.name = 'Sales Executive' AND p.key IN ('dashboard.view','sales.invoice.view','sales.invoice.create','sales.invoice.edit','sales.invoice.print','sales.order.view','sales.order.create','sales.order.edit','sales.customer.view','sales.customer.create','sales.customer.edit'))
  OR (r.name = 'POS / Cashier' AND p.key IN ('dashboard.view','sales.invoice.view','sales.invoice.create','sales.invoice.print','sales.customer.view','sales.customer.create'))
  OR (r.name = 'Purchase User' AND p.module = 'Purchases')
  OR (r.name = 'Inventory User' AND p.key IN ('dashboard.view','inventory.product.view','inventory.product.create','inventory.product.edit','inventory.stock.view','inventory.low_stock.view'))
  OR (r.name = 'Accounts User' AND p.module = 'Accounts')
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_last_master_admin_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.name = 'Master Admin' AND (NEW.name <> OLD.name OR NEW.is_system = false) AND
     (SELECT count(*) FROM roles WHERE name = 'Master Admin' AND is_system) <= 1 THEN
    RAISE EXCEPTION 'The last Master Admin role is protected';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_last_master_admin_role ON roles;
CREATE TRIGGER protect_last_master_admin_role BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION prevent_last_master_admin_change();
