import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission, type AuthenticatedRequest } from "../middleware/authorization.js";

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  priceOverride: z.number().nonnegative().optional(),
  overrideReason: z.string().max(500).optional(),
});

const invoiceCreateSchema = z.object({
  customerId: z.string().uuid(),
  invoiceType: z.string().default("Tax Invoice"),
  paymentMethod: z.string().nullable().optional(),
  discount: z.number().nonnegative().default(0),
  silverRate: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
  draft: z.boolean().default(false),
  source: z.enum(["Internal", "Shopify"]).default("Internal"),
  shopifyOrderId: z.string().nullable().optional(),
  amountPaid: z.number().nonnegative().default(0),
  lines: z.array(lineSchema).min(1),
});

const orderCreateSchema = z.object({
  customerId: z.string().uuid(),
  discount: z.number().nonnegative().default(0),
  silverRate: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
  source: z.enum(["Internal", "Shopify"]).default("Internal"),
  shopifyOrderId: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

const legacyLineSchema = z.object({
  productId: z.string().uuid(), quantity: z.number().int().positive(), unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(), silverRate: z.number().nonnegative(),
});

const legacySaleSchema = z.object({
  customerId: z.string().uuid(), customerName: z.string().min(1),
  customerMobile: z.string().nullable().optional(), invoiceType: z.string().default("Tax Invoice"),
  paymentMethod: z.string().nullable().optional(), subtotal: z.number().nonnegative(), discount: z.number().nonnegative(),
  gstAmount: z.number().nonnegative(), roundOff: z.number(), grandTotal: z.number().nonnegative(),
  amountPaid: z.number().nonnegative(), silverRate: z.number().nonnegative(), notes: z.string().nullable().optional(),
  draft: z.boolean().default(false), source: z.enum(["Internal", "Shopify"]).default("Internal"),
  shopifyOrderId: z.string().nullable().optional(),
  lines: z.array(legacyLineSchema).min(1),
});

const confirmSchema = z.object({ amountPaid: z.number().nonnegative().default(0), paymentMethod: z.string().nullable().optional() });
const paymentSchema = z.object({ amount: z.number().positive(), method: z.string().min(1).default("Cash"), notes: z.string().max(500).optional() });
const cancelSchema = z.object({ reason: z.string().min(1).max(1000) });
const overrideSchema = z.object({ lineId: z.string().uuid(), unitPrice: z.number().nonnegative(), reason: z.string().min(1).max(500) });
const orderStatusSchema = z.object({ action: z.enum(["Confirm", "Cancel"]), reason: z.string().max(1000).optional() });

export const salesRouter: RouterType = Router();

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function hasPerm(req: AuthenticatedRequest, key: string): boolean {
  return req.auth?.permissions.has("*") || req.auth?.permissions.has(key) || false;
}

// Canonical pricing engine — our system controls pricing, never Shopify.
// Metal value = net weight × silver rate; + making + stone + other charges (from product master).
function computeUnitPrice(product: { net_weight: string | number; making_charge: string | number; stone_charge: string | number; other_charge: string | number }, rate: number): number {
  return round2(Number(product.net_weight) * rate + Number(product.making_charge) + Number(product.stone_charge) + Number(product.other_charge));
}

function computeTotals(lines: { unitPrice: number; quantity: number; gstRate: number }[], discount: number) {
  const itemized = lines.map((l) => ({ ...l, lineTotal: round2(l.unitPrice * l.quantity) }));
  const grossSubtotal = itemized.reduce((s, l) => s + l.lineTotal, 0);
  const safeDiscount = round2(Math.min(Math.max(0, discount), grossSubtotal));
  let subtotal = 0;
  let gstAmount = 0;
  const allocated = itemized.map((l) => {
    const alloc = grossSubtotal ? round2(safeDiscount * l.lineTotal / grossSubtotal) : 0;
    const taxable = round2(l.lineTotal - alloc);
    const lineGst = round2(taxable * (l.gstRate / 100));
    subtotal += taxable;
    gstAmount += lineGst;
    return { ...l, lineDiscount: alloc, lineGst };
  });
  subtotal = round2(subtotal);
  gstAmount = round2(gstAmount);
  const beforeRound = subtotal + gstAmount;
  const grandTotal = Math.round(beforeRound);
  const roundOff = round2(grandTotal - beforeRound);
  return { lines: allocated, subtotal, discount: safeDiscount, gstAmount, roundOff, grandTotal };
}

async function currentSilverRate(client: { query(text: string): Promise<{ rows: { rate_per_gram: string }[] }> }): Promise<number> {
  const { rows } = await client.query("select rate_per_gram from silver_rates order by effective_date desc, effective_time desc, created_at desc limit 1");
  return Number(rows[0]?.rate_per_gram || 92.8);
}

type InvoiceLine = { productId: string; quantity: number; priceOverride?: number | undefined; overrideReason?: string | undefined };

// Build priced lines from products inside the active transaction (row-locked).
async function buildPricedLines(client: { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }, lines: InvoiceLine[], rate: number) {
  const result: { product: any; unitPrice: number; quantity: number; lineTotal: number }[] = [];
  for (const line of lines) {
    const { rows } = await client.query("select * from products where id = $1 for update", [line.productId]);
    const product = rows[0];
    if (!product || product.status !== "Active") throw new Error(`Product ${line.productId} is unavailable`);
    if (product.stock_qty < line.quantity) throw new Error(`Insufficient stock for ${product.name}`);
    const unitPrice = line.priceOverride !== undefined ? round2(line.priceOverride) : computeUnitPrice(product, rate);
    result.push({ product, unitPrice, quantity: line.quantity, lineTotal: round2(unitPrice * line.quantity) });
  }
  return result;
}

async function persistInvoiceAndStock(client: { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }, args: {
  input: { customerId: string; invoiceType: string; paymentMethod?: string | null; notes?: string | null; source: string; shopifyOrderId?: string | null; silverRate: number; amountPaid: number; discount: number };
  customer: { name: string; mobile: string | null };
  priced: { product: any; unitPrice: number; quantity: number; lineTotal: number }[];
  totals: ReturnType<typeof computeTotals>;
  userId: string | null;
}) {
  const { input, customer, priced, totals, userId } = args;
  const paymentStatus = input.amountPaid >= totals.grandTotal ? "Paid" : input.amountPaid > 0 ? "Partially Paid" : "Unpaid";
  const invoiceResult = await client.query(
    `insert into invoices (customer_id, customer_name, customer_mobile, invoice_type, status, payment_status, payment_method, subtotal, discount, gst_amount, round_off, grand_total, amount_paid, outstanding_balance, silver_rate, notes, source, shopify_order_id, confirmed_at, confirmed_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),$19) returning *`,
    [input.customerId, customer.name, customer.mobile, input.invoiceType, paymentStatus, paymentStatus, input.paymentMethod ?? null,
     totals.subtotal, totals.discount, totals.gstAmount, totals.roundOff, totals.grandTotal, input.amountPaid,
     Math.max(0, totals.grandTotal - input.amountPaid), input.silverRate, input.notes ?? null, input.source, input.shopifyOrderId ?? null, userId],
  );
  const invoice = invoiceResult.rows[0];
  for (const line of priced) {
    const p = line.product;
    await client.query(
      `insert into invoice_items (invoice_id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate, making_charge, stone_charge, other_charge, gst_rate, quantity, unit_price, line_total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [invoice.id, p.id, p.sku, p.name, p.purity, p.gross_weight, p.net_weight, p.stone_weight, input.silverRate, p.making_charge, p.stone_charge, p.other_charge, p.gst_rate, line.quantity, line.unitPrice, line.lineTotal],
    );
    const updated = await client.query("update products set stock_qty = stock_qty - $1, sold_qty = sold_qty + $1, stock_updated_at = now() where id = $2 returning stock_qty", [line.quantity, p.id]);
    await client.query("insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, created_by) values ($1, 'Sale', $2, $3, $4, 'Invoice', $5)", [p.id, -line.quantity, updated.rows[0].stock_qty, invoice.invoice_number, userId]);
  }
  await client.query("update customers set total_purchases = total_purchases + $1, outstanding_balance = outstanding_balance + $2, loyalty_points = loyalty_points + floor($1 / 100) where id = $3", [totals.grandTotal, Math.max(0, totals.grandTotal - input.amountPaid), input.customerId]);
  if (input.amountPaid > 0) {
    await client.query(
      "insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), 'Incoming', 'Invoice Payment', $1, $2, $3, $4, $5, $6)",
      [customer.name, input.customerId, invoice.invoice_number, input.amountPaid, input.paymentMethod ?? "Cash", userId],
    );
  }
  await client.query(
    "insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Confirmed Sales Invoice', $2, 'Invoice', $3, $4)",
    [userId, invoice.id, JSON.stringify({ invoiceNumber: invoice.invoice_number, total: totals.grandTotal, source: input.source }), `Invoice ${invoice.invoice_number} confirmed — ₹${totals.grandTotal}`],
  );
  return invoice;
}

// ---------- Invoices ----------

// Create invoice. draft=true persists a Draft (no stock/payment/customer changes).
// Confirmed invoices run the full atomic flow: validate stock → invoice → items → stock movement → customer totals → payment → audit.
salesRouter.post("/api/sales/invoices", authenticate, requirePermission("sales.invoice.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = invoiceCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid invoice payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const input = parsed.data;
  if (!input.draft && !hasPerm(req, "sales.invoice.confirm")) return res.status(403).json({ success: false, message: "Missing permission: sales.invoice.confirm" });
  if (input.discount > 0 && !hasPerm(req, "sales.invoice.discount")) return res.status(403).json({ success: false, message: "Missing permission: sales.invoice.discount" });
  if (input.amountPaid > 0 && !hasPerm(req, "sales.invoice.record_payment")) return res.status(403).json({ success: false, message: "Missing permission: sales.invoice.record_payment" });
  for (const line of input.lines) {
    if (line.priceOverride !== undefined && !hasPerm(req, "sales.invoice.price_override")) return res.status(403).json({ success: false, message: "Missing permission: sales.invoice.price_override" });
    if (line.priceOverride !== undefined && !line.overrideReason) return res.status(400).json({ success: false, message: "A reason is required for price overrides" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const customerResult = await client.query("select id, name, mobile, status from customers where id = $1 for share", [input.customerId]);
    if (!customerResult.rows[0]) throw new Error("A valid customer is required for every sale");
    const customer = customerResult.rows[0];
    if (!input.draft && customer.status !== "Active") throw new Error(`Customer ${customer.name} is inactive and cannot be used for a new sale`);
    const rate = input.silverRate ?? await currentSilverRate(client);
    if (input.draft) {
      const totals = { lines: [], subtotal: 0, discount: 0, gstAmount: 0, roundOff: 0, grandTotal: 0 };
      let grand = 0;
      const pricedForDraft: { product: any; unitPrice: number; quantity: number; lineTotal: number }[] = [];
      for (const line of input.lines) {
        const { rows } = await client.query("select * from products where id = $1", [line.productId]);
        const product = rows[0];
        if (!product || product.status !== "Active") throw new Error(`Product ${line.productId} is unavailable`);
        const unitPrice = line.priceOverride !== undefined ? round2(line.priceOverride) : computeUnitPrice(product, rate);
        const lineTotal = round2(unitPrice * line.quantity);
        grand += lineTotal;
        pricedForDraft.push({ product, unitPrice, quantity: line.quantity, lineTotal });
      }
      const draftTotals = computeTotals(pricedForDraft.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, gstRate: l.product.gst_rate })), input.discount);
      const invoiceResult = await client.query(
        `insert into invoices (customer_id, customer_name, customer_mobile, invoice_type, status, payment_status, subtotal, discount, gst_amount, round_off, grand_total, amount_paid, outstanding_balance, silver_rate, notes, source, shopify_order_id)
         values ($1,$2,$3,$4,'Draft','Unpaid',$5,$6,$7,$8,$9,0,$9,$10,$11,$12,$13) returning *`,
        [input.customerId, customer.name, customer.mobile, input.invoiceType, draftTotals.subtotal, draftTotals.discount, draftTotals.gstAmount, draftTotals.roundOff, draftTotals.grandTotal, rate, input.notes ?? null, input.source, input.shopifyOrderId ?? null],
      );
      const invoice = invoiceResult.rows[0];
      for (const line of pricedForDraft) {
        const p = line.product;
        await client.query(
          `insert into invoice_items (invoice_id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate, making_charge, stone_charge, other_charge, gst_rate, quantity, unit_price, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [invoice.id, p.id, p.sku, p.name, p.purity, p.gross_weight, p.net_weight, p.stone_weight, rate, p.making_charge, p.stone_charge, p.other_charge, p.gst_rate, line.quantity, line.unitPrice, line.lineTotal],
        );
      }
      await client.query(
        "insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Created Draft Invoice', $2, 'Invoice', $3, $4)",
        [req.auth?.userId ?? null, invoice.id, JSON.stringify({ invoiceNumber: invoice.invoice_number, total: draftTotals.grandTotal }), `Draft invoice ${invoice.invoice_number} created — ₹${draftTotals.grandTotal}`],
      );
      await client.query("commit");
      return res.status(201).json({ success: true, data: invoice });
    }
    const priced = await buildPricedLines(client, input.lines, rate);
    const totals = computeTotals(priced.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, gstRate: l.product.gst_rate })), input.discount);
    const invoice = await persistInvoiceAndStock(client, {
      input: {
        customerId: input.customerId,
        invoiceType: input.invoiceType,
        paymentMethod: input.paymentMethod ?? null,
        notes: input.notes ?? null,
        source: input.source,
        shopifyOrderId: input.shopifyOrderId ?? null,
        silverRate: rate,
        amountPaid: input.amountPaid,
        discount: input.discount,
      },
      customer,
      priced,
      totals,
      userId: req.auth?.userId ?? null,
    });
    await client.query("commit");
    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Legacy endpoint kept for backward compatibility (createSale). Trusts client-computed line prices.
salesRouter.post("/api/sales", authenticate, requirePermission("sales.invoice.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = legacySaleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid sale payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const sale = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const customerResult = await client.query("select id, name, mobile, status from customers where id = $1 for share", [sale.customerId]);
    if (!customerResult.rows[0]) throw new Error("A valid customer is required for every sale");
    const customer = customerResult.rows[0];
    if (!sale.draft && customer.status !== "Active") throw new Error(`Customer ${customer.name} is inactive and cannot be used for a new sale`);
    const paymentStatus = sale.amountPaid >= sale.grandTotal ? "Paid" : sale.amountPaid > 0 ? "Partially Paid" : "Unpaid";
    const invoiceResult = await client.query(
      `insert into invoices (customer_id, customer_name, customer_mobile, invoice_type, status, payment_status, payment_method, subtotal, discount, gst_amount, round_off, grand_total, amount_paid, outstanding_balance, silver_rate, notes, source, shopify_order_id, confirmed_at, confirmed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning *`,
      [sale.customerId, sale.customerName, sale.customerMobile ?? null, sale.invoiceType, sale.draft ? "Draft" : paymentStatus, sale.draft ? "Unpaid" : paymentStatus, sale.paymentMethod ?? null, sale.subtotal, sale.discount, sale.gstAmount, sale.roundOff, sale.grandTotal, sale.draft ? 0 : sale.amountPaid, Math.max(0, sale.grandTotal - (sale.draft ? 0 : sale.amountPaid)), sale.silverRate, sale.notes ?? null, sale.source, sale.shopifyOrderId ?? null, sale.draft ? null : new Date(), sale.draft ? null : (req.auth?.userId ?? null)],
    );
    const invoice = invoiceResult.rows[0];
    for (const line of sale.lines) {
      const productResult = await client.query("select * from products where id = $1 for update", [line.productId]);
      const product = productResult.rows[0];
      if (!product || product.status !== "Active") throw new Error("Product is unavailable");
      if (!sale.draft && product.stock_qty < line.quantity) throw new Error(`Insufficient stock for ${product.name}`);
      await client.query(
        `insert into invoice_items (invoice_id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate, making_charge, stone_charge, other_charge, gst_rate, quantity, unit_price, line_total)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [invoice.id, product.id, product.sku, product.name, product.purity, product.gross_weight, product.net_weight, product.stone_weight, line.silverRate, product.making_charge, product.stone_charge, product.other_charge, product.gst_rate, line.quantity, line.unitPrice, line.lineTotal],
      );
      if (!sale.draft) {
        const updated = await client.query("update products set stock_qty = stock_qty - $1, sold_qty = sold_qty + $1, stock_updated_at = now() where id = $2 returning stock_qty", [line.quantity, product.id]);
        await client.query("insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, created_by) values ($1, 'Sale', $2, $3, $4, 'Invoice', $5)", [product.id, -line.quantity, updated.rows[0].stock_qty, invoice.invoice_number, req.auth?.userId ?? null]);
      }
    }
    if (!sale.draft && sale.customerId) {
      await client.query("update customers set total_purchases = total_purchases + $1, outstanding_balance = outstanding_balance + $2, loyalty_points = loyalty_points + floor($1 / 100) where id = $3", [sale.grandTotal, Math.max(0, sale.grandTotal - sale.amountPaid), sale.customerId]);
    }
    if (!sale.draft && sale.amountPaid > 0) {
      await client.query("insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), 'Incoming', 'Invoice Payment', $1, $2, $3, $4, $5, $6)", [sale.customerName, sale.customerId ?? null, invoice.invoice_number, sale.amountPaid, sale.paymentMethod ?? "Cash", req.auth?.userId ?? null]);
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', $2, $3, 'Invoice', $4, $5)", [req.auth?.userId ?? null, sale.draft ? "Created Draft Invoice" : "Created Sales Invoice", invoice.id, JSON.stringify({ invoiceNumber: invoice.invoice_number, total: sale.grandTotal }), `Invoice ${invoice.invoice_number} ${sale.draft ? "drafted" : "created"} — ₹${sale.grandTotal}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

salesRouter.get("/api/sales/invoices/:id", authenticate, requirePermission("sales.invoice.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const invoiceResult = await pool.query(
      `select i.*,
        i.subtotal::float8 as subtotal, i.discount::float8 as discount, i.gst_amount::float8 as gst_amount,
        i.round_off::float8 as round_off, i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid,
        i.outstanding_balance::float8 as outstanding_balance, i.silver_rate::float8 as silver_rate,
        c.email, c.shopify_customer_id
       from invoices i left join customers c on c.id = i.customer_id where i.id = $1`, [req.params.id],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const itemsResult = await pool.query(
      `select id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate::float8 as silver_rate,
        making_charge::float8 as making_charge, stone_charge::float8 as stone_charge, other_charge::float8 as other_charge,
        gst_rate, quantity, unit_price::float8 as unit_price, line_total::float8 as line_total
       from invoice_items where invoice_id = $1 order by created_at`, [invoice.id],
    );
    const paymentsResult = await pool.query(
      `select id, payment_number, created_at as payment_date, payment_type, reference, amount::float8 as amount, payment_method, status, notes, created_by, created_at
       from payments where reference = $1 order by created_at`, [invoice.invoice_number],
    );
    res.json({ success: true, data: { invoice, items: itemsResult.rows, payments: paymentsResult.rows } });
  } catch (error) { next(error); }
});

// Confirm a Draft invoice — atomic: re-validate stock → deduct → stock movement → customer totals → payment → audit.
salesRouter.post("/api/sales/invoices/:id/confirm", authenticate, requirePermission("sales.invoice.confirm"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid confirm payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { amountPaid, paymentMethod } = parsed.data;
  if (amountPaid > 0 && !hasPerm(req, "sales.invoice.record_payment")) return res.status(403).json({ success: false, message: "Missing permission: sales.invoice.record_payment" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query("select * from invoices where id = $1 for update", [req.params.id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status !== "Draft") throw new Error(`Only draft invoices can be confirmed (current: ${invoice.status})`);
    const customerResult = await client.query("select id, name, mobile, status from customers where id = $1 for share", [invoice.customer_id]);
    if (!customerResult.rows[0]) throw new Error("A valid customer is required for every sale");
    if (customerResult.rows[0].status !== "Active") throw new Error(`Customer ${customerResult.rows[0].name} is inactive and cannot be used for a new sale`);
    const itemsResult = await client.query("select * from invoice_items where invoice_id = $1", [invoice.id]);
    for (const item of itemsResult.rows) {
      const productResult = await client.query("select * from products where id = $1 for update", [item.product_id]);
      const product = productResult.rows[0];
      if (!product || product.status !== "Active") throw new Error(`Product ${item.name} is unavailable`);
      if (product.stock_qty < item.quantity) throw new Error(`Insufficient stock for ${item.name}`);
      const updated = await client.query("update products set stock_qty = stock_qty - $1, sold_qty = sold_qty + $1, stock_updated_at = now() where id = $2 returning stock_qty", [item.quantity, product.id]);
      await client.query("insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, created_by) values ($1, 'Sale', $2, $3, $4, 'Invoice', $5)", [product.id, -item.quantity, updated.rows[0].stock_qty, invoice.invoice_number, req.auth?.userId ?? null]);
    }
    const paymentStatus = amountPaid >= Number(invoice.grand_total) ? "Paid" : amountPaid > 0 ? "Partially Paid" : "Unpaid";
    const updatedInvoice = await client.query(
      `update invoices set status = $2, payment_status = $3, amount_paid = $4, outstanding_balance = $5, payment_method = coalesce($6, payment_method), confirmed_at = now(), confirmed_by = $7, updated_at = now() where id = $1 returning *`,
      [invoice.id, paymentStatus, paymentStatus, amountPaid, Math.max(0, Number(invoice.grand_total) - amountPaid), paymentMethod, req.auth?.userId ?? null],
    );
    await client.query("update customers set total_purchases = total_purchases + $1, outstanding_balance = outstanding_balance + $2, loyalty_points = loyalty_points + floor($1 / 100) where id = $3", [Number(invoice.grand_total), Math.max(0, Number(invoice.grand_total) - amountPaid), invoice.customer_id]);
    if (amountPaid > 0) {
      await client.query("insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), 'Incoming', 'Invoice Payment', $1, $2, $3, $4, $5, $6)", [customerResult.rows[0].name, invoice.customer_id, invoice.invoice_number, amountPaid, paymentMethod ?? "Cash", req.auth?.userId ?? null]);
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Confirmed Sales Invoice', $2, 'Invoice', $3, $4)", [req.auth?.userId ?? null, invoice.id, JSON.stringify({ invoiceNumber: invoice.invoice_number, fromStatus: "Draft", toStatus: paymentStatus }), `Invoice ${invoice.invoice_number} confirmed — ₹${invoice.grand_total}`]);
    await client.query("commit");
    res.json({ success: true, data: updatedInvoice.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Record an additional payment against a confirmed invoice.
salesRouter.post("/api/sales/invoices/:id/payment", authenticate, requirePermission("sales.invoice.record_payment"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid payment payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { amount, method, notes } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query("select * from invoices where id = $1 for update", [req.params.id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Invoice not found");
    if (["Cancelled", "Returned", "Draft"].includes(invoice.status)) throw new Error(`Payments cannot be recorded on ${invoice.status} invoices`);
    if (amount > Number(invoice.outstanding_balance) + 0.001) throw new Error(`Payment exceeds the outstanding balance of ${invoice.outstanding_balance}`);
    const newPaid = round2(Number(invoice.amount_paid) + amount);
    const newOutstanding = round2(Number(invoice.grand_total) - newPaid);
    const newStatus = newOutstanding <= 0 ? "Paid" : "Partially Paid";
    const paymentResult = await client.query(
      "insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, status, notes, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), 'Incoming', 'Invoice Payment', $1, $2, $3, $4, $5, 'Completed', $6, $7) returning *",
      [invoice.customer_name, invoice.customer_id, invoice.invoice_number, amount, method, notes ?? null, req.auth?.userId ?? null],
    );
    await client.query("update invoices set amount_paid = $2, outstanding_balance = $3, payment_status = $4, updated_at = now() where id = $1", [invoice.id, newPaid, newOutstanding, newStatus]);
    if (invoice.customer_id) {
      await client.query("update customers set outstanding_balance = greatest(0, outstanding_balance - $1) where id = $2", [amount, invoice.customer_id]);
    }
    await client.query("insert into ledger_entries (transaction_type, reference, debit, credit, description, created_by) values ('Incoming Payment', $1, $2, 0, $3, $4)", [invoice.invoice_number, amount, `Payment received on invoice ${invoice.invoice_number}` + (notes ? ` — ${notes}` : ""), req.auth?.userId ?? null]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Recorded Invoice Payment', $2, 'Invoice', $3, $4)", [req.auth?.userId ?? null, invoice.id, JSON.stringify({ invoiceNumber: invoice.invoice_number, amount, method, balance: newOutstanding }), `₹${amount} received on ${invoice.invoice_number} via ${method}`]);
    await client.query("commit");
    res.json({ success: true, data: { payment: paymentResult.rows[0], newOutstanding, paymentStatus: newStatus } });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Controlled cancellation — restock, reverse customer totals, no hard delete.
salesRouter.post("/api/sales/invoices/:id/cancel", authenticate, requirePermission("sales.invoice.cancel"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "A cancellation reason is required", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { reason } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query("select * from invoices where id = $1 for update", [req.params.id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Invoice not found");
    if (["Cancelled", "Returned"].includes(invoice.status)) throw new Error(`Invoice is already ${invoice.status}`);
    const itemsResult = await client.query("select * from invoice_items where invoice_id = $1", [invoice.id]);
    for (const item of itemsResult.rows) {
      const productResult = await client.query("select id from products where id = $1", [item.product_id]);
      if (!productResult.rows[0]) continue;
      const updated = await client.query("update products set stock_qty = stock_qty + $1, sold_qty = greatest(0, sold_qty - $1), stock_updated_at = now() where id = $2 returning stock_qty", [item.quantity, item.product_id]);
      await client.query("insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, created_by) values ($1, 'Cancellation', $2, $3, $4, 'Invoice', $5)", [item.product_id, item.quantity, updated.rows[0].stock_qty, invoice.invoice_number, req.auth?.userId ?? null]);
    }
    if (invoice.customer_id) {
      await client.query("update customers set total_purchases = greatest(0, total_purchases - $1), outstanding_balance = greatest(0, outstanding_balance - $2) where id = $3", [Number(invoice.grand_total), Number(invoice.outstanding_balance), invoice.customer_id]);
    }
    const updated = await client.query("update invoices set status = 'Cancelled', payment_status = 'Cancelled', outstanding_balance = 0, cancelled_at = now(), cancelled_by = $2, cancel_reason = $3, updated_at = now() where id = $1 returning *", [invoice.id, req.auth?.userId ?? null, reason]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Cancelled Sales Invoice', $2, 'Invoice', $3, $4)", [req.auth?.userId ?? null, invoice.id, JSON.stringify({ invoiceNumber: invoice.invoice_number, reason }), `Invoice ${invoice.invoice_number} cancelled — ${reason}`]);
    await client.query("commit");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Price override on a line item — requires permission + reason, audited, invoice totals recomputed.
salesRouter.post("/api/sales/invoices/:id/price-override", authenticate, requirePermission("sales.invoice.price_override"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = overrideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid price override", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { lineId, unitPrice, reason } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query("select * from invoices where id = $1 for update", [req.params.id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Invoice not found");
    if (["Cancelled", "Returned"].includes(invoice.status)) throw new Error("Prices cannot be overridden on cancelled or returned invoices");
    const lineResult = await client.query("select * from invoice_items where id = $1 and invoice_id = $2 for update", [lineId, invoice.id]);
    const line = lineResult.rows[0];
    if (!line) throw new Error("Line item not found on this invoice");
    const newLineTotal = round2(unitPrice * line.quantity);
    await client.query("update invoice_items set unit_price = $1, line_total = $2 where id = $3", [unitPrice, newLineTotal, lineId]);
    const itemsResult = await client.query("select quantity, unit_price, gst_rate from invoice_items where invoice_id = $1", [invoice.id]);
    const totals = computeTotals(itemsResult.rows.map((r) => ({ unitPrice: Number(r.unit_price), quantity: Number(r.quantity), gstRate: Number(r.gst_rate) })), Number(invoice.discount));
    const updated = await client.query("update invoices set subtotal = $2, gst_amount = $3, round_off = $4, grand_total = $5, price_override_reason = $6, updated_at = now() where id = $1 returning *", [invoice.id, totals.subtotal, totals.gstAmount, totals.roundOff, totals.grandTotal, reason]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Override Price', $2, 'Invoice', $3, $4)", [req.auth?.userId ?? null, invoice.id, JSON.stringify({ invoiceNumber: invoice.invoice_number, line: line.name, sku: line.sku, oldPrice: Number(line.unit_price), newPrice: unitPrice, reason }), `Price override on ${line.sku} (${line.name}): ₹${line.unit_price} → ₹${unitPrice} — ${reason}`]);
    await client.query("commit");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Printable invoice (HTML).
salesRouter.get("/api/sales/invoices/:id/print", authenticate, requirePermission("sales.invoice.print"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const invoiceResult = await pool.query("select * from invoices where id = $1", [req.params.id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const itemsResult = await pool.query("select * from invoice_items where invoice_id = $1 order by created_at", [invoice.id]);
    const rows = itemsResult.rows.map((it) => `<tr><td>${it.name}<br/><span style="color:#888;font-size:10px">${it.sku || ""}</span></td><td>${it.purity || ""}</td><td>${Number(it.net_weight)} g</td><td>₹${Number(it.silver_rate).toFixed(2)}</td><td>${it.quantity}</td><td>₹${Number(it.unit_price).toFixed(2)}</td><td>₹${Number(it.line_total).toFixed(2)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Invoice ${invoice.invoice_number}</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;color:#111}.head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}h1{font-size:18px;margin:0}.muted{color:#666;font-size:11px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}th{background:#f1f1f1;text-align:left;padding:6px;font-size:11px}td{padding:6px;border-top:1px solid #eee}.totals{width:260px;margin-left:auto;margin-top:12px}.totals div{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}.totals .grand{font-weight:bold;border-top:2px solid #111;margin-top:6px;padding-top:8px;font-size:14px}.status{display:inline-block;background:#f1f1f1;padding:2px 8px;border-radius:4px;font-size:11px}</style></head><body>
    <div class="head"><div><h1>Opal Line Jewelry</h1><div class="muted">92.5 Sterling Silver Jewellery</div><div class="muted">Silver Rate (92.5): ₹${Number(invoice.silver_rate).toFixed(2)} / gm</div></div><div style="text-align:right"><div style="font-size:14px;font-weight:bold">TAX INVOICE</div><div class="muted">${invoice.invoice_number}</div><div class="muted">${String(invoice.invoice_date)}</div><span class="status">${invoice.status}</span></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12px"><div><div class="muted">BILL TO</div><div style="font-weight:bold;margin-top:4px">${invoice.customer_name}</div><div class="muted">${invoice.customer_mobile || ""}</div></div><div style="text-align:right"><div class="muted">SOURCE</div><div style="font-weight:bold;margin-top:4px">${invoice.source}</div><div class="muted">${invoice.shopify_order_id ? "Shopify Order " + invoice.shopify_order_id : ""}</div></div></div>
    <table><thead><tr><th>Item</th><th>Purity</th><th>Net Wt</th><th>Rate</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><div><span>Subtotal</span><span>₹${Number(invoice.subtotal + invoice.discount).toFixed(2)}</span></div><div><span>Discount</span><span>-₹${Number(invoice.discount).toFixed(2)}</span></div><div><span>GST</span><span>₹${Number(invoice.gst_amount).toFixed(2)}</span></div><div><span>Round Off</span><span>₹${Number(invoice.round_off).toFixed(2)}</span></div><div class="grand"><span>Grand Total</span><span>₹${Number(invoice.grand_total).toFixed(2)}</span></div><div><span>Amount Paid</span><span>₹${Number(invoice.amount_paid).toFixed(2)}</span></div><div><span>Outstanding</span><span>₹${Number(invoice.outstanding_balance).toFixed(2)}</span></div></div>
    </body></html>`;
    res.type("html").send(html);
  } catch (error) { next(error); }
});

// ---------- Sales Orders ----------

salesRouter.get("/api/sales/orders", authenticate, requirePermission("sales.order.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const source = req.query.source ? String(req.query.source) : null;
    const q = req.query.q ? String(req.query.q).trim() : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }
    if (source) { params.push(source); conditions.push(`o.source = $${params.length}`); }
    if (q) { params.push(`%${q}%`); conditions.push(`(o.order_number ilike $${params.length} or o.notes ilike $${params.length} or exists (select 1 from customers c where c.id = o.customer_id and (c.name ilike $${params.length} or c.mobile ilike $${params.length} or c.email ilike $${params.length})))`); }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(
      `select o.*, o.grand_total::float8 as grand_total, o.advance_amount::float8 as advance_amount, o.subtotal::float8 as subtotal, o.discount::float8 as discount, o.gst_amount::float8 as gst_amount, o.round_off::float8 as round_off, o.silver_rate::float8 as silver_rate,
        (select count(*) from sales_order_items oi where oi.order_id = o.id) as item_count,
        c.name as customer_name, c.mobile as customer_mobile
       from sales_orders o left join customers c on c.id = o.customer_id${where}
       order by o.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

salesRouter.post("/api/sales/orders", authenticate, requirePermission("sales.order.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = orderCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid order payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const input = parsed.data;
  if (input.discount > 0 && !hasPerm(req, "sales.invoice.discount")) return res.status(403).json({ success: false, message: "Missing permission: sales.invoice.discount" });
  for (const line of input.lines) {
    if (line.priceOverride !== undefined && !hasPerm(req, "sales.invoice.price_override")) return res.status(403).json({ success: false, message: "Missing permission: sales.invoice.price_override" });
    if (line.priceOverride !== undefined && !line.overrideReason) return res.status(400).json({ success: false, message: "A reason is required for price overrides" });
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const customerResult = await client.query("select id, name, mobile, status from customers where id = $1 for share", [input.customerId]);
    if (!customerResult.rows[0]) throw new Error("A valid customer is required for every order");
    const rate = input.silverRate ?? await currentSilverRate(client);
    const priced: { product: any; unitPrice: number; quantity: number; lineTotal: number }[] = [];
    for (const line of input.lines) {
      const { rows } = await client.query("select * from products where id = $1", [line.productId]);
      const product = rows[0];
      if (!product || product.status !== "Active") throw new Error(`Product ${line.productId} is unavailable`);
      const unitPrice = line.priceOverride !== undefined ? round2(line.priceOverride) : computeUnitPrice(product, rate);
      priced.push({ product, unitPrice, quantity: line.quantity, lineTotal: round2(unitPrice * line.quantity) });
    }
    const totals = computeTotals(priced.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, gstRate: l.product.gst_rate })), input.discount);
    const orderResult = await client.query(
      `insert into sales_orders (customer_id, status, grand_total, subtotal, discount, gst_amount, round_off, silver_rate, notes, source, shopify_order_id, created_by)
       values ($1, 'Draft', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [input.customerId, totals.grandTotal, totals.subtotal, totals.discount, totals.gstAmount, totals.roundOff, rate, input.notes ?? null, input.source, input.shopifyOrderId ?? null, req.auth?.userId ?? null],
    );
    const order = orderResult.rows[0];
    for (const line of priced) {
      const p = line.product;
      await client.query(
        `insert into sales_order_items (order_id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate, making_charge, stone_charge, other_charge, gst_rate, quantity, unit_price, line_total)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [order.id, p.id, p.sku, p.name, p.purity, p.gross_weight, p.net_weight, p.stone_weight, rate, p.making_charge, p.stone_charge, p.other_charge, p.gst_rate, line.quantity, line.unitPrice, line.lineTotal],
      );
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Created Sales Order', $2, 'Order', $3, $4)", [req.auth?.userId ?? null, order.id, JSON.stringify({ orderNumber: order.order_number, total: totals.grandTotal }), `Sales order ${order.order_number} created — ₹${totals.grandTotal}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

salesRouter.get("/api/sales/orders/:id", authenticate, requirePermission("sales.order.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const orderResult = await pool.query(
      `select o.*, o.grand_total::float8 as grand_total, o.advance_amount::float8 as advance_amount, o.subtotal::float8 as subtotal, o.discount::float8 as discount, o.gst_amount::float8 as gst_amount, o.round_off::float8 as round_off, o.silver_rate::float8 as silver_rate, c.name as customer_name, c.mobile as customer_mobile, c.email as customer_email
       from sales_orders o left join customers c on c.id = o.customer_id where o.id = $1`, [req.params.id],
    );
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const itemsResult = await pool.query(
      `select id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate::float8 as silver_rate, making_charge::float8 as making_charge, stone_charge::float8 as stone_charge, other_charge::float8 as other_charge, gst_rate, quantity, unit_price::float8 as unit_price, line_total::float8 as line_total
       from sales_order_items where order_id = $1 order by created_at`, [order.id],
    );
    res.json({ success: true, data: { order, items: itemsResult.rows } });
  } catch (error) { next(error); }
});

// Confirm or cancel an order.
salesRouter.post("/api/sales/orders/:id/status", authenticate, requirePermission("sales.order.view"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = orderStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid order action", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { action, reason } = parsed.data;
  const perm = action === "Confirm" ? "sales.order.confirm" : "sales.order.cancel";
  if (!hasPerm(req, perm)) return res.status(403).json({ success: false, message: `Missing permission: ${perm}` });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const orderResult = await client.query("select * from sales_orders where id = $1 for update", [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) throw new Error("Order not found");
    if (action === "Confirm" && order.status !== "Draft") throw new Error(`Only draft orders can be confirmed (current: ${order.status})`);
    if (action === "Cancel" && order.status === "Converted") throw new Error("Converted orders cannot be cancelled");
    const nextStatus = action === "Confirm" ? "Confirmed" : "Cancelled";
    const updated = await client.query(
      `update sales_orders set status = $2, ${action === "Confirm" ? "confirmed_at = now(), confirmed_by = $3" : "cancelled_at = now(), cancelled_by = $3"} , notes = coalesce($4, notes), updated_at = now() where id = $1 returning *`,
      [order.id, nextStatus, req.auth?.userId ?? null, reason ?? null],
    );
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', $2, $3, 'Order', $4, $5)", [req.auth?.userId ?? null, action === "Confirm" ? "Confirmed Sales Order" : "Cancelled Sales Order", order.id, JSON.stringify({ orderNumber: order.order_number, toStatus: nextStatus, reason }), `Sales order ${order.order_number} ${action.toLowerCase()}ed`]);
    await client.query("commit");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Convert a Confirmed order into a Confirmed invoice (atomic stock deduction + customer totals).
salesRouter.post("/api/sales/orders/:id/convert", authenticate, requirePermission("sales.order.convert_invoice"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const orderResult = await client.query("select * from sales_orders where id = $1 for update", [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) throw new Error("Order not found");
    if (order.status !== "Confirmed") throw new Error(`Only confirmed orders can be converted (current: ${order.status})`);
    const customerResult = await client.query("select id, name, mobile, status from customers where id = $1 for share", [order.customer_id]);
    if (!customerResult.rows[0]) throw new Error("A valid customer is required for every sale");
    if (customerResult.rows[0].status !== "Active") throw new Error(`Customer ${customerResult.rows[0].name} is inactive and cannot be used for a new sale`);
    const itemsResult = await client.query("select * from sales_order_items where order_id = $1", [order.id]);
    const invoiceResult = await client.query(
      `insert into invoices (customer_id, customer_name, customer_mobile, invoice_type, status, payment_status, subtotal, discount, gst_amount, round_off, grand_total, amount_paid, outstanding_balance, silver_rate, notes, source, shopify_order_id, confirmed_at, confirmed_by)
       values ($1,$2,$3,'Tax Invoice','Unpaid','Unpaid',$4,$5,$6,$7,$8,0,$8,$9,$10,$11,$12,now(),$13) returning *`,
      [order.customer_id, customerResult.rows[0].name, customerResult.rows[0].mobile, Number(order.subtotal), Number(order.discount), Number(order.gst_amount), Number(order.round_off), Number(order.grand_total), Number(order.silver_rate), order.notes, order.source, order.shopify_order_id ?? null, req.auth?.userId ?? null],
    );
    const invoice = invoiceResult.rows[0];
    for (const item of itemsResult.rows) {
      await client.query(
        `insert into invoice_items (invoice_id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate, making_charge, stone_charge, other_charge, gst_rate, quantity, unit_price, line_total)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [invoice.id, item.product_id, item.sku, item.name, item.purity, item.gross_weight, item.net_weight, item.stone_weight, item.silver_rate, item.making_charge, item.stone_charge, item.other_charge, item.gst_rate, item.quantity, item.unit_price, item.line_total],
      );
      if (item.product_id) {
        const productResult = await client.query("select * from products where id = $1 for update", [item.product_id]);
        const product = productResult.rows[0];
        if (product && product.status === "Active" && product.stock_qty >= item.quantity) {
          const updated = await client.query("update products set stock_qty = stock_qty - $1, sold_qty = sold_qty + $1, stock_updated_at = now() where id = $2 returning stock_qty", [item.quantity, item.product_id]);
          await client.query("insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, created_by) values ($1, 'Sale', $2, $3, $4, 'Invoice', $5)", [item.product_id, -item.quantity, updated.rows[0].stock_qty, invoice.invoice_number, req.auth?.userId ?? null]);
        } else {
          throw new Error(`Insufficient stock or inactive product for ${item.name}`);
        }
      }
    }
    await client.query("update customers set total_purchases = total_purchases + $1, outstanding_balance = outstanding_balance + $2, loyalty_points = loyalty_points + floor($1 / 100) where id = $3", [Number(order.grand_total), Number(order.grand_total), order.customer_id]);
    await client.query("update sales_orders set status = 'Converted', updated_at = now() where id = $1", [order.id]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Converted Order to Invoice', $2, 'Order', $3, $4)", [req.auth?.userId ?? null, order.id, JSON.stringify({ orderNumber: order.order_number, invoiceNumber: invoice.invoice_number }), `Order ${order.order_number} converted to invoice ${invoice.invoice_number}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});
