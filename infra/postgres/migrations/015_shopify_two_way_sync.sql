-- Controlled two-way Shopify sync: persistent mapping IDs + richer sync log.

ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_location_id text;
CREATE INDEX IF NOT EXISTS idx_products_shopify_variant ON products(shopify_variant_id);
CREATE INDEX IF NOT EXISTS idx_products_shopify_inventory_item ON products(shopify_inventory_item_id);

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS operation text;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS sync_run_id text;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS shopify_product_id text;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS shopify_variant_id text;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text;

CREATE INDEX IF NOT EXISTS idx_sync_logs_synced ON sync_logs(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity ON sync_logs(sync_type, entity_name);

CREATE TABLE IF NOT EXISTS shopify_sync_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  product_sku text,
  direction text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'Warning',
  shopify_value text,
  our_value text,
  status text NOT NULL DEFAULT 'Open',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_flags_status ON shopify_sync_flags(status);
