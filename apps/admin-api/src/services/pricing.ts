// Canonical pricing engine — the single authoritative source for all
// price derivation in the ERP. Every rate-dependent price (product price
// previews, sales invoices/orders, Shopify prices, silver-rate publish)
// must go through this module so the formula and rounding are identical
// everywhere. The ERP owns pricing; Shopify never computes our prices.

// All money is rounded to 2 decimal places using the same policy.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// The product attributes the pricing engine needs. Only these fields
// participate in price derivation.
export type PriceComponents = {
  net_weight: number | string;
  making_charge?: number | string | null;
  stone_charge?: number | string | null;
  other_charge?: number | string | null;
  gst_rate?: number | string | null;
};

export type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

// ---------------------------------------------------------------------------
// Rate handling
// ---------------------------------------------------------------------------

// A silver rate is valid only when it is a finite, positive number.
export function isSilverRateValid(rate: number | null | undefined): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

// Reads the current active per-gram silver rate. Returns null when no rate
// has been configured — callers MUST treat null as "not configured" and fail
// rather than pricing with a fabricated rate. No fallback value is ever used.
export async function getCurrentSilverRate(client: Queryable): Promise<number | null> {
  const { rows } = await client.query(
    'select rate_per_gram from silver_rates order by effective_date desc, effective_time desc, created_at desc limit 1',
  );
  const rate = rows[0]?.rate_per_gram;
  if (rate === null || rate === undefined || rate === '') return null;
  const numeric = Number(rate);
  return isSilverRateValid(numeric) ? numeric : null;
}

// ---------------------------------------------------------------------------
// Price derivation
// ---------------------------------------------------------------------------

// Tax-exclusive unit price for a single item. This is what sales invoice /
// order line items record as their unit_price; GST is applied separately per
// line by the invoice totals aggregation.
export function calculateUnitPrice(product: PriceComponents, silverRate: number): number {
  return round2(
    Number(product.net_weight) * silverRate
    + Number(product.making_charge ?? 0)
    + Number(product.stone_charge ?? 0)
    + Number(product.other_charge ?? 0),
  );
}

// Tax-exclusive line total for `quantity` units.
export function calculateLinePrice(product: PriceComponents, silverRate: number, quantity: number): number {
  return round2(calculateUnitPrice(product, silverRate) * quantity);
}

// GST (or any percentage tax) on a taxable value.
export function calculateTax(taxable: number, gstRate: number | string | null | undefined): number {
  return round2(taxable * (Number(gstRate || 0) / 100));
}

// Tax-inclusive customer-facing price (Shopify, price previews, publish).
// The ERP's authoritative formula: unit price + GST on the unit price.
export function calculateFinalPrice(product: PriceComponents, silverRate: number): number {
  const unit = calculateUnitPrice(product, silverRate);
  return round2(unit + calculateTax(unit, product.gst_rate));
}
