// Client-side preview mirroring the backend canonical pricing engine
// (apps/admin-api/src/services/pricing.ts). Backend remains authoritative for
// persisted/published prices; this render-only utility uses the exact formula.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type PriceComponents = {
  net_weight: number | string;
  making_charge?: number | string | null;
  stone_charge?: number | string | null;
  other_charge?: number | string | null;
  gst_rate?: number | string | null;
};

export function calculateUnitPrice(product: PriceComponents, silverRate: number): number {
  return round2(
    Number(product.net_weight) * silverRate
    + Number(product.making_charge ?? 0)
    + Number(product.stone_charge ?? 0)
    + Number(product.other_charge ?? 0),
  );
}

export function calculateLinePrice(product: PriceComponents, silverRate: number, quantity: number): number {
  return round2(calculateUnitPrice(product, silverRate) * quantity);
}

export function calculateTax(taxable: number, gstRate: number | string | null | undefined): number {
  return round2(taxable * (Number(gstRate || 0) / 100));
}

export function calculateFinalPrice(product: PriceComponents, silverRate: number): number {
  const unit = calculateUnitPrice(product, silverRate);
  return round2(unit + calculateTax(unit, product.gst_rate));
}
