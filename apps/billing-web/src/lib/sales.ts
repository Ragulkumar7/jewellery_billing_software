import { round2 } from './math';
import { calculateUnitPrice } from './pricing';

// Cart line item used in POS / invoicing.
export type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  purity: string;
  gross_weight: number;
  net_weight: number;
  stone_weight: number;
  making_charge: number;
  stone_charge: number;
  other_charge: number;
  gst_rate: number;
  quantity: number;
  silver_rate: number;
  priceOverride?: number;
  overrideReason?: string;
};

export function computeUnitPrice(item: {
  net_weight: number;
  silver_rate: number;
  making_charge: number;
  stone_charge: number;
  other_charge: number;
  priceOverride?: number;
}): number {
  if (item.priceOverride !== undefined) return round2(item.priceOverride);
  return calculateUnitPrice(item, item.silver_rate);
}

export function computeCartTotals(items: CartItem[], discount: number) {
  let grossSubtotal = 0;
  const lines = items.map((item) => {
    const unit = computeUnitPrice(item);
    const lineSubtotal = unit * item.quantity;
    grossSubtotal += lineSubtotal;
    return { ...item, unit_price: unit, line_total: round2(lineSubtotal), line_gst: 0 };
  });
  const safeDiscount = round2(Math.min(Math.max(0, discount), grossSubtotal));
  let subtotal = 0;
  let gstAmount = 0;
  const adjustedLines = lines.map((line) => {
    const allocation = grossSubtotal ? round2(safeDiscount * line.line_total / grossSubtotal) : 0;
    const taxable = round2(line.line_total - allocation);
    const lineGst = round2(taxable * (line.gst_rate / 100));
    subtotal += taxable;
    gstAmount += lineGst;
    return { ...line, line_discount: allocation, line_gst: lineGst };
  });
  subtotal = round2(subtotal);
  gstAmount = round2(gstAmount);
  const beforeRound = subtotal + gstAmount;
  const grandTotal = Math.round(beforeRound);
  const roundOff = round2(grandTotal - beforeRound);
  return { lines: adjustedLines, subtotal, discount: safeDiscount, gstAmount, roundOff, grandTotal };
}
