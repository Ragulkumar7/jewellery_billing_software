-- Price snapshots recorded by the silver-rate publish flow. Every time prices
-- are bulk-recalculated after a silver rate change, the derived price for each
-- affected product is persisted here for audit and rollback reference.

CREATE TABLE IF NOT EXISTS product_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price numeric(14,2) NOT NULL,
  silver_rate numeric(14,2) NOT NULL,
  net_weight numeric(12,3) NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_product ON product_price_snapshots(product_id, computed_at DESC);