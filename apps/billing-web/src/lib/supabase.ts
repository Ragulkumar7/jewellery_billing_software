import { createClient } from '@supabase/supabase-js';
import { api } from './api';

// Kept as a compatibility adapter while screens are migrated to the PostgreSQL API.
// The production data path is the Node API, not a browser database connection.
const url = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:4000';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'local-development-key';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  collection: string | null;
  purity: string;
  gross_weight: number;
  net_weight: number;
  stone_weight: number;
  making_charge: number;
  stone_charge: number;
  other_charge: number;
  hallmark: string | null;
  gst_rate: number;
  stock_qty: number;
  min_stock_qty: number;
  image_url: string | null;
  barcode: string | null;
  reserved_qty: number;
  sold_qty: number;
  status: string;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
  shopify_location_id: string | null;
  shopify_sync_status: string;
  shopify_last_sync: string | null;
  stock_updated_at: string;
};

export type StockHistory = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity_change: number;
  resulting_qty: number;
  reference: string | null;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
};

export type ShopifySyncLog = {
  id: string;
  sync_type: string;
  entity_id: string | null;
  entity_name: string;
  shopify_id: string | null;
  status: string;
  error_message: string | null;
  attempts: number;
  synced_at: string;
  created_at: string;
  direction: string | null;
  operation: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
};

export type ShopifySyncFlag = {
  id: string;
  product_id: string | null;
  product_sku: string | null;
  direction: string;
  category: string;
  severity: string;
  shopify_value: string | null;
  our_value: string | null;
  status: string;
  remarks: string | null;
  created_at: string;
};

export type ReconciliationResult = {
  ranAt: string;
  silverRate: number;
  summary: {
    localProducts: number;
    shopifyVariants: number;
    matched: number;
    missingInShopify: number;
    missingInBilling: number;
    priceMismatch: number;
    inventoryMismatch: number;
  };
  details: {
    matched: { sku: string; name: string; ourPrice: number; shopifyPrice: number; priceDiff: number }[];
    missingInShopify: { sku: string; name: string; ourPrice: number; stock: number }[];
    missingInBilling: { sku: string; title: string; price: number; inventoryQuantity: number | null }[];
    priceMismatch: { sku: string; name: string; ourPrice: number; shopifyPrice: number; diff: number }[];
    inventoryMismatch: { sku: string; name: string; ourStock: number; shopifyStock: number | null; difference: number | null }[];
  };
};

export type Expense = {
  id: string;
  expense_number: string;
  category: string;
  expense_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  description: string | null;
  attachment_url: string | null;
  remarks: string | null;
  status: string;
  created_by: string;
  created_at: string;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  description: string | null;
};

export type Payment = {
  id: string;
  payment_number: string;
  payment_date: string;
  direction: string;
  payment_type: string;
  party_name: string | null;
  party_type: string | null;
  reference: string | null;
  amount: number;
  payment_method: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export type SilverRateHistory = {
  id: string;
  purity: string;
  previous_rate: number;
  new_rate: number;
  rate_change: number;
  effective_date: string;
  effective_time: string;
  remarks: string | null;
  updated_by: string;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  gst_number: string | null;
  customer_type: string;
  billing_address: string | null;
  shipping_address: string | null;
  credit_limit: number;
  outstanding_balance: number;
  loyalty_points: number;
  total_purchases: number;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
  shopify_customer_id?: string | null;
  customer_code?: string | null;
  status?: string;
  date_of_birth?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pin_code?: string | null;
  shopify_status?: string | null;
  last_shopify_sync_at?: string | null;
  source?: 'Internal' | 'Shopify' | 'Linked';
  invoice_count?: number;
  total_paid?: number;
  shopify_total_orders?: number;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_mobile: string | null;
  invoice_type: string;
  invoice_date: string;
  due_date: string | null;
  salesperson: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  gst_amount: number;
  round_off: number;
  grand_total: number;
  amount_paid: number;
  outstanding_balance: number;
  silver_rate: number;
  notes: string | null;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  category: string | null;
  purity: string | null;
  gross_weight: number;
  net_weight: number;
  stone_weight: number;
  silver_rate: number;
  making_charge: number;
  stone_charge: number;
  other_charge: number;
  gst_rate: number;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type HeldBill = {
  id: string;
  reference: string;
  customer_name: string;
  customer_id: string | null;
  cart: any[];
  subtotal: number;
  discount: number;
  grand_total: number;
  payment_method: string | null;
  amount_paid: number;
  staff_name: string;
  notes: string | null;
  status: string;
  expires_at: string;
  created_at: string;
};

export type SalesReturn = {
  id: string;
  return_number: string;
  invoice_id: string;
  return_type: string;
  refund_type: string;
  return_date: string;
  customer_id: string | null;
  customer_name: string | null;
  reason: string | null;
  subtotal: number;
  gst_amount: number;
  grand_total: number;
  status: string;
  processed_by: string;
  created_at: string;
};

export type ReturnItem = {
  id: string;
  return_id: string;
  invoice_item_id: string | null;
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type SilverRate = {
  id: string;
  purity: string;
  rate_per_gram: number;
  effective_date: string;
};

export type Shift = {
  id: string;
  staff_name: string;
  shift_date: string;
  opening_cash: number;
  cash_sales: number;
  card_sales: number;
  upi_sales: number;
  expenses: number;
  withdrawals: number;
  closing_cash: number;
  cash_difference: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

// Purchase module types
export type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  pan: string | null;
  bank_details: string | null;
  payment_terms: string;
  credit_limit: number;
  outstanding_balance: number;
  total_purchases: number;
  delivery_performance: number;
  return_percentage: number;
  product_quality: number;
  category: string;
  created_at: string;
};

export type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string;
  po_date: string;
  expected_delivery: string | null;
  delivery_address: string | null;
  warehouse: string;
  payment_terms: string;
  currency: string;
  status: string;
  subtotal: number;
  discount: number;
  additional_charges: number;
  gst_amount: number;
  grand_total: number;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type POItem = {
  id: string;
  po_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  category: string | null;
  purity: string;
  weight: number;
  quantity: number;
  unit_cost: number;
  expected_silver_rate: number | null;
  making_charge: number;
  stone_charge: number;
  line_total: number;
};

export type PurchaseInvoice = {
  id: string;
  pi_number: string;
  supplier_invoice_number: string | null;
  supplier_id: string | null;
  supplier_name: string;
  pi_date: string;
  due_date: string | null;
  po_reference: string | null;
  grn_reference: string | null;
  status: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  gst_amount: number;
  grand_total: number;
  amount_paid: number;
  outstanding_balance: number;
  silver_weight: number;
  silver_rate: number;
  making_charges: number;
  stone_charges: number;
  hallmark_charges: number;
  labour_charges: number;
  other_charges: number;
  notes: string | null;
  created_at: string;
};

export type PIItem = {
  id: string;
  pi_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type GRN = {
  id: string;
  grn_number: string;
  po_id: string | null;
  po_number: string | null;
  supplier_id: string | null;
  supplier_name: string;
  grn_date: string;
  warehouse: string;
  batch_number: string | null;
  inspection_status: string;
  status: string;
  total_qty: number;
  notes: string | null;
  created_at: string;
};

export type GRNItem = {
  id: string;
  grn_id: string;
  po_item_id: string | null;
  product_id: string | null;
  sku: string | null;
  name: string;
  ordered_qty: number;
  received_qty: number;
  damaged_qty: number;
  gross_weight: number;
  net_weight: number;
  stone_weight: number;
  purity_check: string;
  hallmark_verification: string;
};

export type PurchaseReturn = {
  id: string;
  pr_number: string;
  supplier_id: string | null;
  supplier_name: string;
  grn_reference: string | null;
  invoice_reference: string | null;
  return_date: string;
  return_type: string;
  refund_type: string;
  reason: string | null;
  subtotal: number;
  gst_amount: number;
  grand_total: number;
  status: string;
  created_at: string;
};

export type PRItem = {
  id: string;
  pr_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type SupplierPayment = {
  id: string;
  payment_number: string;
  supplier_id: string;
  supplier_name: string;
  payment_date: string;
  method: string;
  amount: number;
  payment_type: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

// Cart line item used in POS / invoicing
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

export type SaleInvoicePayload = Omit<Pick<Invoice, 'customer_id' | 'customer_name' | 'customer_mobile' | 'invoice_type' | 'status' | 'payment_status' | 'payment_method' | 'subtotal' | 'discount' | 'gst_amount' | 'round_off' | 'grand_total' | 'amount_paid' | 'outstanding_balance' | 'silver_rate' | 'notes'>, 'customer_id' | 'customer_name' | 'notes'> & { customer_id: string; customer_name: string; notes?: string | null };

export type SaleResult = { invoice: Invoice; error: string | null };

export async function createSale(invoice: SaleInvoicePayload, lines: ReturnType<typeof computeCartTotals>['lines'], userName: string): Promise<SaleResult> {
  try {
    const data = await api<Invoice>('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        customerId: invoice.customer_id,
        customerName: invoice.customer_name,
        customerMobile: invoice.customer_mobile,
        invoiceType: invoice.invoice_type,
        paymentMethod: invoice.payment_method,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        gstAmount: invoice.gst_amount,
        roundOff: invoice.round_off,
        grandTotal: invoice.grand_total,
        amountPaid: invoice.amount_paid,
        silverRate: invoice.silver_rate,
        notes: invoice.notes,
        lines: lines.map((line) => ({ productId: line.product_id, quantity: line.quantity, unitPrice: line.unit_price, lineTotal: line.line_total, silverRate: line.silver_rate })),
      }),
    });
    return { invoice: data, error: null };
  } catch (error) {
    return { invoice: null as unknown as Invoice, error: error instanceof Error ? error.message : 'Unable to create sale' };
  }
}

// Canonical price formula (our system controls pricing):
// metal value = net weight × silver rate; + making + stone + other charges (from product master).
// An explicit priceOverride (permission-gated, audited) takes precedence.
export function computeUnitPrice(item: {
  net_weight: number;
  silver_rate: number;
  making_charge: number;
  stone_charge: number;
  other_charge: number;
  priceOverride?: number;
}): number {
  if (item.priceOverride !== undefined) return round2(item.priceOverride);
  return round2(item.net_weight * item.silver_rate + item.making_charge + item.stone_charge + item.other_charge);
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

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function inr(n: number): string {
  const value = Number(n);
  return '₹' + (Number.isFinite(value) ? value : 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

// System module types have moved to ./types.ts
// (SystemUser, SystemRole, ActivityLog, SystemSetting)
