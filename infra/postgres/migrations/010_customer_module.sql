-- Customer module: customer codes, status lifecycle, address fields, Shopify
-- sync metadata, and granular customer permissions.

CREATE SEQUENCE IF NOT EXISTS customer_code_seq START 1;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_code text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shopify_status text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_shopify_sync_at timestamptz;

UPDATE customers SET customer_code = 'CUS-' || lpad((nextval('customer_code_seq'))::text, 6, '0') WHERE customer_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_unique ON customers(customer_code) WHERE customer_code IS NOT NULL;

CREATE OR REPLACE FUNCTION assign_customer_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_code IS NULL THEN
    NEW.customer_code := 'CUS-' || lpad((nextval('customer_code_seq'))::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_customers_assign_code ON customers;
CREATE TRIGGER trg_customers_assign_code BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION assign_customer_code();

CREATE OR REPLACE FUNCTION touch_customers_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_customers_touch_updated ON customers;
CREATE TRIGGER trg_customers_touch_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION touch_customers_updated_at();

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(lower(email));

WITH definition(key, module, resource, action) AS (VALUES
  ('sales.customer.deactivate','Sales','customer','deactivate'),
  ('sales.customer.export','Sales','customer','export'),
  ('sales.customer.link_shopify','Sales','customer','link_shopify')
)
INSERT INTO permissions(key, module, resource, action)
SELECT key, module, resource, action FROM definition ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Master Admin'
  AND p.key IN ('sales.customer.deactivate','sales.customer.export','sales.customer.link_shopify')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  (r.name = 'Manager' AND p.key IN ('sales.customer.deactivate','sales.customer.export','sales.customer.link_shopify'))
  OR (r.name = 'Sales Executive' AND p.key IN ('sales.customer.edit'))
)
ON CONFLICT DO NOTHING;
