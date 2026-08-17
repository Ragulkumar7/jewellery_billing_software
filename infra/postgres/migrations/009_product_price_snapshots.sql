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
</｜DSML｜>
<task_progress>
- [x] Create migration 008 (silver_rate_history)
- [x] Update silver-rate backend routes (GET/POST/publish)
- [x] Fix GET date/time formatting
- [x] Create SilverRateContext + provider
- [x] Wire App.tsx header to context
- [x] Update SilverRate.tsx to use context
- [x] Update POSBilling to use context
- [x] Update POSDashboard to use context
- [x] Update Products to use context
- [x] Verify SalesInvoices already wired to context
- [x] Type check frontend + backend
- [ ] Create migration 009 (product_price_snapshots)
- [ ] Run migrations 008 + 009
- [ ] Verify GET returns clean date
- [ ] Verify project running
- [ ] Clean up temp files
- [ ] Present result
</｜DSML｜>
</write_to_file>