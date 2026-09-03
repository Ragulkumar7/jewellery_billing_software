import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission, type AuthenticatedRequest } from "../middleware/authorization.js";

const returnItemSchema = z.object({
  invoiceItemId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
  sku: z.string().nullable().optional(),
  name: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
});

const createReturnSchema = z.object({
  invoiceId: z.string().uuid(),
  returnType: z.enum(["Full", "Partial"]).default("Partial"),
  refundType: z.enum(["Refund", "Exchange", "Credit Note"]).default("Refund"),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  subtotal: z.number().nonnegative(),
  gstAmount: z.number().nonnegative(),
  grandTotal: z.number().nonnegative(),
  items: z.array(returnItemSchema).min(1),
});

const heldBillSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().default("Walk-in Customer"),
  cart: z.array(z.record(z.string(), z.unknown())),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  grandTotal: z.number().nonnegative(),
  paymentMethod: z.string().nullable().optional(),
  amountPaid: z.number().nonnegative().default(0),
  staffName: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function hasPerm(req: AuthenticatedRequest, key: string): boolean {
  return req.auth?.permissions.has("*") || req.auth?.permissions.has(key) || false;
}

export const returnsRouter: RouterType = Router();

// ---------- Sales Returns ----------

returnsRouter.get("/api/sales/returns", authenticate, requirePermission("sales.return.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(r.return_number ilike $${params.length} or coalesce(r.customer_name, '') ilike $${params.length})`);
    }
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    params.push(limit);
    const { rows } = await pool.query(
      `select r.*, r.subtotal::float8 as subtotal, r.gst_amount::float8 as gst_amount, r.grand_total::float8 as grand_total,
        i.invoice_number,
        (select count(*) from return_items it where it.return_id = r.id)::int as item_count
       from sales_returns r left join invoices i on i.id = r.invoice_id${where}
       order by r.created_at desc limit $${params.length}`,
      params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

returnsRouter.get("/api/sales/returns/eligible-invoices", authenticate, requirePermission("sales.return.create"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(
      `select i.*, i.subtotal::float8 as subtotal, i.gst_amount::float8 as gst_amount, i.round_off::float8 as round_off,
        i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid, i.outstanding_balance::float8 as outstanding_balance,
        i.silver_rate::float8 as silver_rate
       from invoices i
       where i.status in ('Paid', 'Partially Paid', 'Unpaid')
       order by i.invoice_date desc, i.created_at desc limit 50`,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

returnsRouter.get("/api/sales/returns/:id", authenticate, requirePermission("sales.return.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(
      `select r.*, r.subtotal::float8 as subtotal, r.gst_amount::float8 as gst_amount, r.grand_total::float8 as grand_total,
        i.invoice_number
       from sales_returns r left join invoices i on i.id = r.invoice_id where r.id = $1`,
      [req.params.id],
    );
    const ret = rows[0];
    if (!ret) return res.status(404).json({ success: false, message: "Sales return not found" });
    const itemsResult = await pool.query(
      `select it.*, it.quantity::float8 as quantity, it.unit_price::float8 as unit_price, it.line_total::float8 as line_total
       from return_items it where it.return_id = $1 order by it.created_at`,
      [req.params.id],
    );
    res.json({ success: true, data: { salesReturn: ret, items: itemsResult.rows } });
  } catch (error) { next(error); }
});

returnsRouter.get("/api/sales/invoices/:id/items", authenticate, requirePermission("sales.return.create"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(
      `select it.*, it.gross_weight::float8 as gross_weight, it.net_weight::float8 as net_weight, it.stone_weight::float8 as stone_weight,
        it.silver_rate::float8 as silver_rate, it.making_charge::float8 as making_charge, it.stone_charge::float8 as stone_charge,
        it.other_charge::float8 as other_charge, it.gst_rate::float8 as gst_rate, it.unit_price::float8 as unit_price,
        it.line_total::float8 as line_total
       from invoice_items it where it.invoice_id = $1 order by it.created_at`,
      [req.params.id],
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

returnsRouter.post("/api/sales/returns", authenticate, requirePermission("sales.return.create"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const parsed = createReturnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid return payload", issues: parsed.error.issues });
  if (!hasPerm(req, "sales.return.process")) return res.status(403).json({ success: false, message: "Missing permission: sales.return.process" });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query("select * from invoices where id = $1 for update", [input.invoiceId]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Invoice not found");
    if (["Cancelled", "Returned", "Draft"].includes(invoice.status)) throw new Error(`Returns cannot be processed on ${invoice.status} invoices`);

    const invItemsResult = await client.query("select * from invoice_items where invoice_id = $1", [input.invoiceId]);
    const invItems = new Map(invItemsResult.rows.map((r: any) => [r.id, r]));
    for (const item of input.items) {
      if (item.invoiceItemId) {
        const original = invItems.get(item.invoiceItemId);
        if (!original) throw new Error(`Return item ${item.name} is not part of invoice ${invoice.invoice_number}`);
        if (item.quantity > Number(original.quantity)) throw new Error(`Return quantity for ${item.name} exceeds the invoice quantity`);
      }
    }

    const returnResult = await client.query(
      `insert into sales_returns (invoice_id, return_type, refund_type, return_date, customer_id, customer_name, subtotal, gst_amount, grand_total, reason, status, processed_by, created_by, processed_at)
       values ($1,$2,$3,current_date,$4,$5,$6,$7,$8,$9,'Processed',$10,$11,now()) returning *`,
      [input.invoiceId, input.returnType, input.refundType, input.customerId ?? null, input.customerName ?? invoice.customer_name, round2(input.subtotal), round2(input.gstAmount), round2(input.grandTotal), input.reason ?? null, req.auth?.userId ? String(req.auth.userId) : null, req.auth?.userId ?? null],
    );
    const ret = returnResult.rows[0];

    for (const item of input.items) {
      await client.query(
        `insert into return_items (return_id, invoice_item_id, product_id, sku, name, quantity, unit_price, line_total)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ret.id, item.invoiceItemId ?? null, item.productId ?? null, item.sku ?? null, item.name, item.quantity, round2(item.unitPrice), round2(item.lineTotal)],
      );
      if (item.productId) {
        const productResult = await client.query("select * from products where id = $1 for update", [item.productId]);
        const product = productResult.rows[0];
        if (product) {
          const qty = Math.round(Number(item.quantity));
          const updated = await client.query(
            "update products set stock_qty = stock_qty + $1, sold_qty = greatest(0, sold_qty - $1), stock_updated_at = now() where id = $2 returning stock_qty",
            [qty, item.productId],
          );
          await client.query(
            `insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, notes, created_by)
             values ($1, 'Sales Return', $2, $3, $4, 'Return', $5, $6)`,
            [item.productId, qty, updated.rows[0].stock_qty, ret.return_number, `Returned ${qty} of ${item.name}`, req.auth?.userId ?? null],
          );
        }
      }
    }

    if (invoice.customer_id) {
      await client.query(
        "update customers set total_purchases = greatest(0, total_purchases - $1), outstanding_balance = greatest(0, outstanding_balance - $2) where id = $3",
        [Number(ret.grand_total), Number(ret.grand_total), invoice.customer_id],
      );
    }

    if (input.returnType === "Full") {
      await client.query(
        "update invoices set status = 'Returned', payment_status = 'Returned', outstanding_balance = 0, returned_at = now(), returned_by = $2, updated_at = now() where id = $1",
        [input.invoiceId, req.auth?.userId ?? null],
      );
    }

    await client.query(
      `insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Sales', 'Processed Sales Return', $2, 'Sales Return', $3, $4)`,
      [req.auth?.userId ?? null, ret.id, JSON.stringify({ returnNumber: ret.return_number, invoiceNumber: invoice.invoice_number, total: Number(ret.grand_total) }), `Sales return ${ret.return_number} processed for invoice ${invoice.invoice_number}`],
    );

    await client.query("commit");
    res.status(201).json({ success: true, data: ret });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// ---------- Held Bills ----------

returnsRouter.get("/api/sales/held-bills", authenticate, requirePermission("sales.heldbill.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const onlyHeld = req.query.status ? String(req.query.status) : "Held";
    const { rows } = await pool.query(
      `select hb.*, hb.subtotal::float8 as subtotal, hb.discount::float8 as discount, hb.grand_total::float8 as grand_total,
        hb.amount_paid::float8 as amount_paid
       from held_bills hb where hb.status = $1 order by hb.created_at desc`,
      [onlyHeld],
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

returnsRouter.post("/api/sales/held-bills", authenticate, requirePermission("sales.heldbill.create"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const parsed = heldBillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid held bill payload", issues: parsed.error.issues });
  const input = parsed.data;
  try {
    const { rows } = await pool.query(
      `insert into held_bills (customer_id, customer_name, cart, subtotal, discount, grand_total, payment_method, amount_paid, staff_name, notes, status, expires_at, created_by)
       values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,'Held',now() + interval '7 days',$11) returning *`,
      [input.customerId ?? null, input.customerName, JSON.stringify(input.cart), round2(input.subtotal), round2(input.discount), round2(input.grandTotal), input.paymentMethod ?? null, round2(input.amountPaid), input.staffName ?? null, input.notes ?? null, req.auth?.userId ?? null],
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

returnsRouter.post("/api/sales/held-bills/:id/resume", authenticate, requirePermission("sales.heldbill.resume"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query("select * from held_bills where id = $1 for update", [req.params.id]);
    const bill = result.rows[0];
    if (!bill) throw new Error("Held bill not found");
    if (bill.status !== "Held") throw new Error(`Held bill is already ${bill.status}`);
    await client.query(
      "update held_bills set status = 'Resumed', resumed_at = now(), resumed_by = $2 where id = $1",
      [req.params.id, req.auth?.userId ?? null],
    );
    await client.query("commit");
    res.json({ success: true, data: bill });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});
