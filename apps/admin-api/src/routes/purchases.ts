import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission, type AuthenticatedRequest } from "../middleware/authorization.js";

export const purchasesRouter: RouterType = Router();

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const actionPastTense: Record<string, string> = { Submit: "Submitted", Approve: "Approved", Cancel: "Cancelled" };
function pastTense(action: string): string {
  return actionPastTense[action] ?? action.toLowerCase() + "ed";
}

function computePurchaseTotals(lines: { lineTotal: number; gstRate: number }[], discount: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const safeDiscount = round2(Math.min(Math.max(0, discount), subtotal));
  const gstAmount = round2(lines.reduce((s, l) => s + round2(l.lineTotal * (l.gstRate / 100)), 0));
  const beforeRound = subtotal - safeDiscount + gstAmount;
  const grandTotal = Math.round(beforeRound);
  const roundOff = round2(grandTotal - beforeRound);
  return { subtotal, discount: safeDiscount, gstAmount, roundOff, grandTotal };
}

async function getSupplier(client: { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }, id: string) {
  const { rows } = await client.query("select * from suppliers where id = $1", [id]);
  return rows[0];
}

// ---------- Suppliers ----------

purchasesRouter.get("/api/suppliers", authenticate, requirePermission("purchase.supplier.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const status = req.query.status ? String(req.query.status) : null;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(s.name ilike $${params.length} or s.company_name ilike $${params.length} or s.mobile ilike $${params.length} or s.email ilike $${params.length} or s.gst_number ilike $${params.length})`);
    }
    if (status) { params.push(status); conditions.push(`s.status = $${params.length}`); }
    params.push(50);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select s.*, s.outstanding_balance::float8 as outstanding_balance, s.total_purchases::float8 as total_purchases, s.credit_limit::float8 as credit_limit,
        (select count(*) from purchase_orders o where o.supplier_id = s.id and o.status not in ('Cancelled')) as po_count,
        (select count(*) from purchase_invoices i where i.supplier_id = s.id and i.status not in ('Cancelled','Draft')) as pi_count
      from suppliers s${where} order by s.name asc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

const supplierSchema = z.object({
  name: z.string().min(1),
  company_name: z.string().max(200).optional().nullable(),
  contact_person: z.string().max(200).optional().nullable(),
  mobile: z.string().max(20).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  gst_number: z.string().max(50).optional().nullable(),
  pan: z.string().max(50).optional().nullable(),
  payment_terms: z.string().max(100).default("Immediate"),
  credit_limit: z.number().nonnegative().default(0),
  bank_name: z.string().max(200).optional().nullable(),
  bank_account_no: z.string().max(50).optional().nullable(),
  bank_ifsc: z.string().max(50).optional().nullable(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

purchasesRouter.post("/api/suppliers", authenticate, requirePermission("purchase.supplier.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid supplier payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const s = parsed.data;
  try {
    const { rows } = await pool.query(
      `insert into suppliers (name, company_name, contact_person, mobile, email, address, gst_number, pan, payment_terms, credit_limit, bank_name, bank_account_no, bank_ifsc, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [s.name, s.company_name ?? null, s.contact_person ?? null, s.mobile ?? null, s.email ?? null, s.address ?? null, s.gst_number ?? null, s.pan ?? null, s.payment_terms, s.credit_limit, s.bank_name ?? null, s.bank_account_no ?? null, s.bank_ifsc ?? null, s.status],
    );
    await pool.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Created Supplier', $2, 'Supplier', $3, $4)", [req.auth?.userId ?? null, rows[0].id, JSON.stringify({ name: s.name }), `Supplier ${s.name} created`]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

purchasesRouter.get("/api/suppliers/:id", authenticate, requirePermission("purchase.supplier.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const supplierResult = await pool.query("select s.*, s.outstanding_balance::float8 as outstanding_balance, s.total_purchases::float8 as total_purchases, s.credit_limit::float8 as credit_limit from suppliers s where s.id = $1", [req.params.id]);
    const supplier = supplierResult.rows[0];
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });
    const [ordersResult, invoicesResult, paymentsResult, grnsResult, returnsResult] = await Promise.all([
      pool.query("select o.*, o.grand_total::float8 as grand_total, (select count(*) from po_items i where i.po_id = o.id) as item_count from purchase_orders o where o.supplier_id = $1 order by o.created_at desc limit 50", [supplier.id]),
      pool.query("select i.*, i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid, i.outstanding_balance::float8 as outstanding_balance from purchase_invoices i where i.supplier_id = $1 order by i.created_at desc limit 50", [supplier.id]),
      pool.query("select p.*, p.amount::float8 as amount from payments p where p.party_id = $1 order by p.created_at desc limit 50", [supplier.id]),
      pool.query("select g.*, (select count(*) from grn_items gi where gi.grn_id = g.id) as item_count from grns g where g.supplier_id = $1 order by g.created_at desc limit 50", [supplier.id]),
      pool.query("select r.*, r.grand_total::float8 as grand_total from purchase_returns r where r.supplier_id = $1 order by r.created_at desc limit 50", [supplier.id]),
    ]);
    res.json({ success: true, data: { supplier, orders: ordersResult.rows, invoices: invoicesResult.rows, payments: paymentsResult.rows, grns: grnsResult.rows, returns: returnsResult.rows } });
  } catch (error) { next(error); }
});

purchasesRouter.put("/api/suppliers/:id", authenticate, requirePermission("purchase.supplier.edit"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = supplierSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid supplier payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const fields = parsed.data;
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return res.status(400).json({ success: false, message: "No fields supplied" });
  try {
    const sets = entries.map(([k], i) => `${k === "company_name" ? "company_name" : k} = $${i + 2}`);
    const values = entries.map(([, v]) => v ?? null);
    const { rows } = await pool.query(`update suppliers set ${sets.join(", ")}, updated_at = now() where id = $1 returning *`, [req.params.id, ...values]);
    if (!rows[0]) return res.status(404).json({ success: false, message: "Supplier not found" });
    await pool.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Updated Supplier', $2, 'Supplier', $3, $4)", [req.auth?.userId ?? null, rows[0].id, JSON.stringify(fields), `Supplier ${rows[0].name} updated`]);
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

purchasesRouter.post("/api/suppliers/:id/status", authenticate, requirePermission("purchase.supplier.deactivate"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ status: z.enum(["Active", "Inactive"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid status", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query("update suppliers set status = $2, updated_at = now() where id = $1 returning *", [req.params.id, parsed.data.status]);
    if (!rows[0]) return res.status(404).json({ success: false, message: "Supplier not found" });
    await pool.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', $2, $3, 'Supplier', $4, $5)", [req.auth?.userId ?? null, parsed.data.status === "Active" ? "Activated Supplier" : "Deactivated Supplier", rows[0].id, JSON.stringify({ status: parsed.data.status }), `Supplier ${rows[0].name} set to ${parsed.data.status}`]);
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

// ---------- Purchase Orders ----------

purchasesRouter.get("/api/purchase-orders", authenticate, requirePermission("purchase.order.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const status = req.query.status ? String(req.query.status) : null;
    const supplierId = req.query.supplierId ? String(req.query.supplierId) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }
    if (supplierId) { params.push(supplierId); conditions.push(`o.supplier_id = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`o.po_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`o.po_date <= $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(o.po_number ilike $${params.length} or s.name ilike $${params.length} or exists (select 1 from po_items i where i.po_id = o.id and (i.sku ilike $${params.length} or i.name ilike $${params.length})))`);
    }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select o.*, o.grand_total::float8 as grand_total, o.subtotal::float8 as subtotal, o.discount::float8 as discount, o.gst_amount::float8 as gst_amount, o.round_off::float8 as round_off,
        s.name as supplier_name, s.mobile as supplier_mobile,
        (select count(*) from po_items i where i.po_id = o.id) as item_count,
        coalesce((select sum(gi.received_qty) from grns g join grn_items gi on gi.grn_id = g.id where g.po_id = o.id and g.status = 'Approved'), 0) as total_received
      from purchase_orders o left join suppliers s on s.id = o.supplier_id${where}
      order by o.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

const poLineSchema = z.object({ productId: z.string().uuid(), quantity: z.number().positive(), unitCost: z.number().nonnegative() });
const poCreateSchema = z.object({
  supplierId: z.string().uuid(),
  poDate: z.string().date().optional(),
  expectedDelivery: z.string().date().optional().nullable(),
  discount: z.number().nonnegative().default(0),
  notes: z.string().max(1000).optional().nullable(),
  lines: z.array(poLineSchema).min(1),
});

purchasesRouter.post("/api/purchase-orders", authenticate, requirePermission("purchase.order.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = poCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid purchase order payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const supplier = await getSupplier(client, input.supplierId);
    if (!supplier) throw new Error("Supplier not found");
    if (supplier.status !== "Active") throw new Error(`Supplier ${supplier.name} is inactive`);
    const priced: { product: any; quantity: number; unitCost: number; lineTotal: number }[] = [];
    for (const line of input.lines) {
      const { rows } = await client.query("select * from products where id = $1", [line.productId]);
      const product = rows[0];
      if (!product) throw new Error(`Product ${line.productId} not found`);
      const unitCost = round2(line.unitCost);
      priced.push({ product, quantity: line.quantity, unitCost, lineTotal: round2(unitCost * line.quantity) });
    }
    const totals = computePurchaseTotals(priced.map((l) => ({ lineTotal: l.lineTotal, gstRate: Number(l.product.gst_rate) })), input.discount);
    const orderResult = await client.query(
      `insert into purchase_orders (supplier_id, status, po_date, expected_delivery, subtotal, discount, gst_amount, round_off, grand_total, notes, created_by)
       values ($1, 'Draft', $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [input.supplierId, input.poDate ?? new Date().toISOString().slice(0, 10), input.expectedDelivery ?? null, totals.subtotal, totals.discount, totals.gstAmount, totals.roundOff, totals.grandTotal, input.notes ?? null, req.auth?.userId ?? null],
    );
    const order = orderResult.rows[0];
    for (const line of priced) {
      const p = line.product;
      await client.query(
        `insert into po_items (po_id, product_id, sku, name, purity, unit, gross_weight, net_weight, stone_weight, quantity, unit_cost, line_total)
         values ($1,$2,$3,$4,$5,'pcs',$6,$7,$8,$9,$10,$11)`,
        [order.id, p.id, p.sku, p.name, p.purity, p.gross_weight, p.net_weight, p.stone_weight, line.quantity, line.unitCost, line.lineTotal],
      );
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Created Purchase Order', $2, 'Purchase Order', $3, $4)", [req.auth?.userId ?? null, order.id, JSON.stringify({ poNumber: order.po_number, total: totals.grandTotal }), `Purchase order ${order.po_number} created — ₹${totals.grandTotal}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

purchasesRouter.get("/api/purchase-orders/:id", authenticate, requirePermission("purchase.order.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const orderResult = await pool.query(
      `select o.*, o.grand_total::float8 as grand_total, o.subtotal::float8 as subtotal, o.discount::float8 as discount, o.gst_amount::float8 as gst_amount, o.round_off::float8 as round_off, s.name as supplier_name, s.mobile as supplier_mobile, s.address as supplier_address, s.gst_number as supplier_gst
       from purchase_orders o left join suppliers s on s.id = o.supplier_id where o.id = $1`, [req.params.id],
    );
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const itemsResult = await pool.query("select i.*, i.quantity::float8 as quantity, i.unit_cost::float8 as unit_cost, i.line_total::float8 as line_total from po_items i where i.po_id = $1 order by i.created_at", [order.id]);
    const receivedResult = await pool.query(
      `select gi.po_item_id, sum(gi.received_qty)::float8 as received from grns g join grn_items gi on gi.grn_id = g.id where g.po_id = $1 and g.status = 'Approved' group by gi.po_item_id`, [order.id],
    );
    const receivedMap = new Map(receivedResult.rows.map((r) => [r.po_item_id, Number(r.received)]));
    const items = itemsResult.rows.map((it) => ({ ...it, received_qty: receivedMap.get(it.id) || 0 }));
    const [grnsResult, invoicesResult] = await Promise.all([
      pool.query("select g.*, (select count(*) from grn_items gi where gi.grn_id = g.id) as item_count from grns g where g.po_id = $1 order by g.created_at", [order.id]),
      pool.query("select i.*, i.grand_total::float8 as grand_total from purchase_invoices i where i.po_id = $1 order by i.created_at", [order.id]),
    ]);
    res.json({ success: true, data: { order, items, grns: grnsResult.rows, invoices: invoicesResult.rows } });
  } catch (error) { next(error); }
});

const poStatusSchema = z.object({ action: z.enum(["Submit", "Approve", "Cancel"]), reason: z.string().max(1000).optional().nullable() });

purchasesRouter.post("/api/purchase-orders/:id/status", authenticate, requirePermission("purchase.order.view"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = poStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid order action", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { action, reason } = parsed.data;
  const perm = action === "Submit" ? "purchase.order.edit" : action === "Approve" ? "purchase.order.approve" : "purchase.order.cancel";
  if (!(req.auth?.permissions.has("*") || req.auth?.permissions.has(perm))) return res.status(403).json({ success: false, message: `Missing permission: ${perm}` });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const orderResult = await client.query("select * from purchase_orders where id = $1 for update", [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) throw new Error("Purchase order not found");
    const next = action === "Submit" ? "Submitted" : action === "Approve" ? "Approved" : "Cancelled";
    if (action === "Approve" && !["Draft", "Submitted"].includes(order.status)) throw new Error(`Only draft or submitted orders can be approved (current: ${order.status})`);
    if (action === "Submit" && order.status !== "Draft") throw new Error(`Only draft orders can be submitted (current: ${order.status})`);
    if (action === "Cancel" && ["Fully Received", "Closed", "Cancelled"].includes(order.status)) throw new Error(`Order cannot be cancelled (current: ${order.status})`);
    const updated = await client.query(
      `update purchase_orders set status = $2,
        ${action === "Submit" ? "submitted_at = now(), submitted_by = $3" : action === "Approve" ? "approved_at = now(), approved_by = $3" : "cancelled_at = now(), cancelled_by = $3"},
        notes = coalesce($4, notes), updated_at = now() where id = $1 returning *`,
      [order.id, next, req.auth?.userId ?? null, reason ?? null],
    );
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', $2, $3, 'Purchase Order', $4, $5)", [req.auth?.userId ?? null, `${pastTense(action)} Purchase Order`, order.id, JSON.stringify({ poNumber: order.po_number, toStatus: next }), `Purchase order ${order.po_number} ${pastTense(action).toLowerCase()}`]);
    await client.query("commit");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// ---------- GRN / Stock Receive ----------

purchasesRouter.get("/api/grns", authenticate, requirePermission("purchase.grn.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const status = req.query.status ? String(req.query.status) : null;
    const supplierId = req.query.supplierId ? String(req.query.supplierId) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conditions.push(`g.status = $${params.length}`); }
    if (supplierId) { params.push(supplierId); conditions.push(`g.supplier_id = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(g.grn_number ilike $${params.length} or s.name ilike $${params.length} or o.po_number ilike $${params.length})`);
    }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select g.*, s.name as supplier_name, o.po_number,
        (select count(*) from grn_items gi where gi.grn_id = g.id) as item_count,
        coalesce((select sum(gi.received_qty) from grn_items gi where gi.grn_id = g.id), 0)::float8 as total_received
      from grns g left join suppliers s on s.id = g.supplier_id left join purchase_orders o on o.id = g.po_id${where}
      order by g.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

const grnItemSchema = z.object({ poItemId: z.string().uuid(), receivedQty: z.number().nonnegative(), grossWeight: z.number().nonnegative().optional(), netWeight: z.number().nonnegative().optional(), stoneWeight: z.number().nonnegative().optional() });
const grnCreateSchema = z.object({ poId: z.string().uuid(), grnDate: z.string().date().optional(), notes: z.string().max(1000).optional().nullable(), items: z.array(grnItemSchema).min(1) });

purchasesRouter.post("/api/grns", authenticate, requirePermission("purchase.grn.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = grnCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid GRN payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const orderResult = await client.query("select * from purchase_orders where id = $1 for update", [input.poId]);
    const order = orderResult.rows[0];
    if (!order) throw new Error("Purchase order not found");
    if (!["Approved", "Ordered", "Partially Received"].includes(order.status)) throw new Error(`Only approved orders can receive stock (current: ${order.status})`);
    const grnResult = await client.query(
      `insert into grns (po_id, supplier_id, status, grn_date, notes, created_by) values ($1, $2, 'Draft', $3, $4, $5) returning *`,
      [order.id, order.supplier_id, input.grnDate ?? new Date().toISOString().slice(0, 10), input.notes ?? null, req.auth?.userId ?? null],
    );
    const grn = grnResult.rows[0];
    for (const item of input.items) {
      const poItemResult = await client.query("select * from po_items where id = $1 and po_id = $2", [item.poItemId, order.id]);
      const poItem = poItemResult.rows[0];
      if (!poItem) throw new Error("Order line item not found");
      await client.query(
        `insert into grn_items (grn_id, po_item_id, product_id, sku, name, purity, unit, expected_qty, received_qty, gross_weight, net_weight, stone_weight)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [grn.id, poItem.id, poItem.product_id, poItem.sku, poItem.name, poItem.purity, poItem.unit, poItem.quantity, item.receivedQty, item.grossWeight ?? poItem.gross_weight, item.netWeight ?? poItem.net_weight, item.stoneWeight ?? poItem.stone_weight],
      );
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Created GRN', $2, 'GRN', $3, $4)", [req.auth?.userId ?? null, grn.id, JSON.stringify({ grnNumber: grn.grn_number, poNumber: order.po_number }), `GRN ${grn.grn_number} created for ${order.po_number}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: grn });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

purchasesRouter.get("/api/grns/:id", authenticate, requirePermission("purchase.grn.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const grnResult = await pool.query(
      `select g.*, s.name as supplier_name, o.po_number from grns g left join suppliers s on s.id = g.supplier_id left join purchase_orders o on o.id = g.po_id where g.id = $1`, [req.params.id],
    );
    const grn = grnResult.rows[0];
    if (!grn) return res.status(404).json({ success: false, message: "GRN not found" });
    const itemsResult = await pool.query("select gi.*, gi.expected_qty::float8 as expected_qty, gi.received_qty::float8 as received_qty from grn_items gi where gi.grn_id = $1 order by gi.created_at", [grn.id]);
    res.json({ success: true, data: { grn, items: itemsResult.rows } });
  } catch (error) { next(error); }
});

// Approve GRN → atomic: increase stock, record stock movement, update PO receipt status.
purchasesRouter.post("/api/grns/:id/approve", authenticate, requirePermission("purchase.grn.approve"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const grnResult = await client.query("select * from grns where id = $1 for update", [req.params.id]);
    const grn = grnResult.rows[0];
    if (!grn) throw new Error("GRN not found");
    if (grn.status !== "Draft") throw new Error(`Only draft GRNs can be approved (current: ${grn.status})`);
    const itemsResult = await client.query("select * from grn_items where grn_id = $1", [grn.id]);
    for (const item of itemsResult.rows) {
      if (item.product_id) {
        const receivedQty = Math.round(Number(item.received_qty));
        const updated = await client.query("update products set stock_qty = stock_qty + $1, stock_updated_at = now() where id = $2 returning stock_qty", [receivedQty, item.product_id]);
        await client.query("insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, notes, created_by) values ($1, 'Purchase Receipt', $2, $3, $4, 'GRN', $5, $6)", [item.product_id, receivedQty, updated.rows[0].stock_qty, grn.grn_number, `Received ${receivedQty} ${item.unit || 'pcs'} of ${item.name}`, req.auth?.userId ?? null]);
      }
    }
    if (grn.po_id) {
      const receivedResult = await client.query(
        `select gi.po_item_id, sum(gi.received_qty)::float8 as received from grns g join grn_items gi on gi.grn_id = g.id where g.po_id = $1 and (g.status = 'Approved' or g.id = $2) group by gi.po_item_id`, [grn.po_id, grn.id],
      );
      const receivedMap = new Map(receivedResult.rows.map((r) => [r.po_item_id, Number(r.received)]));
      const poItemsResult = await client.query("select id, quantity from po_items where po_id = $1", [grn.po_id]);
      const allReceived = poItemsResult.rows.every((it) => (receivedMap.get(it.id) || 0) >= Number(it.quantity));
      const poStatus = allReceived ? "Fully Received" : "Partially Received";
      await client.query("update purchase_orders set status = $2, updated_at = now() where id = $1", [grn.po_id, poStatus]);
    }
    const updated = await client.query("update grns set status = 'Approved', approved_at = now(), approved_by = $2 where id = $1 returning *", [grn.id, req.auth?.userId ?? null]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Approved GRN — Stock Received', $2, 'GRN', $3, $4)", [req.auth?.userId ?? null, grn.id, JSON.stringify({ grnNumber: grn.grn_number }), `GRN ${grn.grn_number} approved and added ${itemsResult.rows.length} item(s) to inventory`]);
    await client.query("commit");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// ---------- Purchase Invoices ----------

purchasesRouter.get("/api/purchase-invoices", authenticate, requirePermission("purchase.invoice.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const status = req.query.status ? String(req.query.status) : null;
    const payment = req.query.payment ? String(req.query.payment) : null;
    const supplierId = req.query.supplierId ? String(req.query.supplierId) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
    if (payment) { params.push(payment); conditions.push(`i.payment_status = $${params.length}`); }
    if (supplierId) { params.push(supplierId); conditions.push(`i.supplier_id = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`i.pi_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`i.pi_date <= $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(i.pi_number ilike $${params.length} or i.supplier_invoice_number ilike $${params.length} or s.name ilike $${params.length} or exists (select 1 from pi_items it where it.pi_id = i.id and (it.sku ilike $${params.length} or it.name ilike $${params.length})))`);
    }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select i.*, i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid, i.outstanding_balance::float8 as outstanding_balance, i.subtotal::float8 as subtotal, i.gst_amount::float8 as gst_amount, i.round_off::float8 as round_off,
        s.name as supplier_name,
        (select count(*) from pi_items it where it.pi_id = i.id) as item_count
      from purchase_invoices i left join suppliers s on s.id = i.supplier_id${where}
      order by i.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

const piLineSchema = z.object({ productId: z.string().uuid(), quantity: z.number().positive(), unitCost: z.number().nonnegative(), gstRate: z.number().nonnegative().optional() });
const piCreateSchema = z.object({
  supplierId: z.string().uuid(),
  supplierInvoiceNumber: z.string().max(100).optional().nullable(),
  piDate: z.string().date().optional(),
  dueDate: z.string().date().optional().nullable(),
  poId: z.string().uuid().optional().nullable(),
  grnId: z.string().uuid().optional().nullable(),
  discount: z.number().nonnegative().default(0),
  notes: z.string().max(1000).optional().nullable(),
  lines: z.array(piLineSchema).min(1),
});

purchasesRouter.post("/api/purchase-invoices", authenticate, requirePermission("purchase.invoice.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = piCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid purchase invoice payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const supplier = await getSupplier(client, input.supplierId);
    if (!supplier) throw new Error("Supplier not found");
    const priced: { product: any; quantity: number; unitCost: number; lineTotal: number; gstRate: number }[] = [];
    for (const line of input.lines) {
      const { rows } = await client.query("select * from products where id = $1", [line.productId]);
      const product = rows[0];
      if (!product) throw new Error(`Product ${line.productId} not found`);
      const unitCost = round2(line.unitCost);
      const gstRate = line.gstRate ?? Number(product.gst_rate);
      priced.push({ product, quantity: line.quantity, unitCost, lineTotal: round2(unitCost * line.quantity), gstRate });
    }
    const totals = computePurchaseTotals(priced, input.discount);
    let mismatch = false;
    if (input.grnId) {
      const grnItemsResult = await client.query("select product_id, sum(received_qty)::float8 as received from grn_items where grn_id = $1 group by product_id", [input.grnId]);
      const receivedMap = new Map(grnItemsResult.rows.map((r) => [r.product_id, Number(r.received)]));
      mismatch = priced.some((l) => l.product.id && receivedMap.has(l.product.id) && Number(l.quantity) !== receivedMap.get(l.product.id));
    }
    const invoiceResult = await client.query(
      `insert into purchase_invoices (supplier_id, supplier_invoice_number, status, payment_status, pi_date, due_date, po_id, grn_id, subtotal, discount, gst_amount, round_off, grand_total, amount_paid, outstanding_balance, notes, created_by)
       values ($1,$2,'Draft','Unpaid',$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$11,$12,$13) returning *`,
      [input.supplierId, input.supplierInvoiceNumber ?? null, input.piDate ?? new Date().toISOString().slice(0, 10), input.dueDate ?? null, input.poId ?? null, input.grnId ?? null, totals.subtotal, totals.discount, totals.gstAmount, totals.roundOff, totals.grandTotal, input.notes ?? null, req.auth?.userId ?? null],
    );
    const invoice = invoiceResult.rows[0];
    for (const line of priced) {
      await client.query(
        `insert into pi_items (pi_id, product_id, sku, name, quantity, unit_cost, line_total, gst_rate, gst_amount)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [invoice.id, line.product.id, line.product.sku, line.product.name, line.quantity, line.unitCost, line.lineTotal, line.gstRate, round2(line.lineTotal * (line.gstRate / 100))],
      );
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Created Purchase Invoice', $2, 'Purchase Invoice', $3, $4)", [req.auth?.userId ?? null, invoice.id, JSON.stringify({ piNumber: invoice.pi_number, total: totals.grandTotal, mismatch }), `Purchase invoice ${invoice.pi_number} created — ₹${totals.grandTotal}` + (mismatch ? " (quantity mismatch with GRN flagged)" : "")]);
    await client.query("commit");
    res.status(201).json({ success: true, data: invoice, mismatch });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

purchasesRouter.get("/api/purchase-invoices/:id", authenticate, requirePermission("purchase.invoice.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const invoiceResult = await pool.query(
      `select i.*, i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid, i.outstanding_balance::float8 as outstanding_balance, i.subtotal::float8 as subtotal, i.gst_amount::float8 as gst_amount, i.round_off::float8 as round_off,
        s.name as supplier_name, s.mobile as supplier_mobile, s.gst_number as supplier_gst, o.po_number, g.grn_number
       from purchase_invoices i left join suppliers s on s.id = i.supplier_id left join purchase_orders o on o.id = i.po_id left join grns g on g.id = i.grn_id where i.id = $1`, [req.params.id],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return res.status(404).json({ success: false, message: "Purchase invoice not found" });
    const itemsResult = await pool.query("select it.*, it.quantity::float8 as quantity, it.unit_cost::float8 as unit_cost, it.line_total::float8 as line_total from pi_items it where it.pi_id = $1 order by it.created_at", [invoice.id]);
    const paymentsResult = await pool.query("select p.*, p.amount::float8 as amount from payments p where p.reference = $1 order by p.created_at", [invoice.pi_number]);
    res.json({ success: true, data: { invoice, items: itemsResult.rows, payments: paymentsResult.rows } });
  } catch (error) { next(error); }
});

const piStatusSchema = z.object({ action: z.enum(["Approve", "Cancel"]), reason: z.string().max(1000).optional().nullable() });

purchasesRouter.post("/api/purchase-invoices/:id/status", authenticate, requirePermission("purchase.invoice.view"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = piStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid invoice action", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { action, reason } = parsed.data;
  const perm = action === "Approve" ? "purchase.invoice.approve" : "purchase.invoice.cancel";
  if (!(req.auth?.permissions.has("*") || req.auth?.permissions.has(perm))) return res.status(403).json({ success: false, message: `Missing permission: ${perm}` });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query("select * from purchase_invoices where id = $1 for update", [req.params.id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Purchase invoice not found");
    if (action === "Approve" && invoice.status !== "Draft") throw new Error(`Only draft invoices can be approved (current: ${invoice.status})`);
    if (action === "Cancel" && ["Approved", "Paid", "Partially Paid", "Cancelled"].includes(invoice.status)) throw new Error(`Invoice cannot be cancelled (current: ${invoice.status})`);
    const nextStatus = action === "Approve" ? "Approved" : "Cancelled";
    const updated = await client.query(
      `update purchase_invoices set status = $2, ${action === "Approve" ? "approved_at = now(), approved_by = $3" : "cancelled_at = now(), cancelled_by = $3"}, updated_at = now() where id = $1 returning *`,
      [invoice.id, nextStatus, req.auth?.userId ?? null],
    );
    if (action === "Approve") {
      await client.query("update suppliers set total_purchases = total_purchases + $1, outstanding_balance = outstanding_balance + $2 where id = $3", [Number(invoice.grand_total), Number(invoice.grand_total), invoice.supplier_id]);
      await client.query("insert into ledger_entries (transaction_type, reference, debit, credit, description, created_by) values ('Supplier Invoice', $1, $2, 0, $3, $4)", [invoice.pi_number, Number(invoice.grand_total), `Supplier payable on ${invoice.pi_number}`, req.auth?.userId ?? null]);
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', $2, $3, 'Purchase Invoice', $4, $5)", [req.auth?.userId ?? null, `${pastTense(action)} Purchase Invoice`, invoice.id, JSON.stringify({ piNumber: invoice.pi_number, toStatus: nextStatus }), `Purchase invoice ${invoice.pi_number} ${pastTense(action).toLowerCase()}`]);
    await client.query("commit");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Record supplier payment against an approved invoice.
purchasesRouter.post("/api/purchase-invoices/:id/payment", authenticate, requirePermission("accounts.payment.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ amount: z.number().positive(), method: z.string().min(1).default("Cash"), notes: z.string().max(500).optional().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid payment payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { amount, method, notes } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceResult = await client.query("select * from purchase_invoices where id = $1 for update", [req.params.id]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Purchase invoice not found");
    if (!["Approved", "Partially Paid", "Paid"].includes(invoice.status)) throw new Error(`Payments can only be recorded on approved invoices (current: ${invoice.status})`);
    if (amount > Number(invoice.outstanding_balance) + 0.001) throw new Error(`Payment exceeds the outstanding balance of ${invoice.outstanding_balance}`);
    const newPaid = round2(Number(invoice.amount_paid) + amount);
    const newOutstanding = round2(Number(invoice.grand_total) - newPaid);
    const newPaymentStatus = newOutstanding <= 0 ? "Paid" : "Partially Paid";
    const paymentResult = await client.query(
      "insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, status, notes, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), 'Outgoing', 'Supplier Payment', $1, $2, $3, $4, $5, 'Completed', $6, $7) returning *",
      [invoice.supplier_name || (await getSupplier(client, invoice.supplier_id))?.name, invoice.supplier_id, invoice.pi_number, amount, method, notes ?? null, req.auth?.userId ?? null],
    );
    await client.query("update purchase_invoices set amount_paid = $2, outstanding_balance = $3, payment_status = $4, status = $4, updated_at = now() where id = $1", [invoice.id, newPaid, newOutstanding, newPaymentStatus]);
    await client.query("update suppliers set outstanding_balance = greatest(0, outstanding_balance - $1) where id = $2", [amount, invoice.supplier_id]);
    await client.query("insert into ledger_entries (transaction_type, reference, debit, credit, description, created_by) values ('Outgoing Payment', $1, $2, 0, $3, $4)", [invoice.pi_number, amount, `Supplier payment on ${invoice.pi_number}` + (notes ? ` — ${notes}` : ""), req.auth?.userId ?? null]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Recorded Supplier Payment', $2, 'Purchase Invoice', $3, $4)", [req.auth?.userId ?? null, invoice.id, JSON.stringify({ piNumber: invoice.pi_number, amount, method, balance: newOutstanding }), `₹${amount} paid to supplier on ${invoice.pi_number} via ${method}`]);
    await client.query("commit");
    res.json({ success: true, data: { payment: paymentResult.rows[0], newOutstanding, paymentStatus: newPaymentStatus } });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// ---------- Purchase Returns ----------

purchasesRouter.get("/api/purchase-returns", authenticate, requirePermission("purchase.return.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(r.return_number ilike $${params.length} or s.name ilike $${params.length} or g.grn_number ilike $${params.length})`);
    }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select r.*, r.grand_total::float8 as grand_total, s.name as supplier_name, g.grn_number,
        (select count(*) from pr_items it where it.return_id = r.id) as item_count
      from purchase_returns r left join suppliers s on s.id = r.supplier_id left join grns g on g.id = r.grn_id${where}
      order by r.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

const prItemSchema = z.object({ grnItemId: z.string().uuid().optional().nullable(), productId: z.string().uuid(), quantity: z.number().positive(), unitCost: z.number().nonnegative(), reason: z.string().max(500).optional() });
const prCreateSchema = z.object({
  supplierId: z.string().uuid(),
  grnId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  returnDate: z.string().date().optional(),
  reason: z.string().max(200).optional(),
  remarks: z.string().max(1000).optional().nullable(),
  items: z.array(prItemSchema).min(1),
});

purchasesRouter.post("/api/purchase-returns", authenticate, requirePermission("purchase.return.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = prCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid return payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const grnResult = await client.query("select * from grns where id = $1", [input.grnId]);
    const grn = grnResult.rows[0];
    if (!grn) throw new Error("GRN not found");
    if (grn.supplier_id !== input.supplierId) throw new Error("Supplier does not match the referenced GRN");
    const returnResult = await client.query(
      `insert into purchase_returns (supplier_id, grn_id, invoice_id, status, return_date, reason, remarks, created_by)
       values ($1,$2,$3,'Draft',$4,$5,$6,$7) returning *`,
      [input.supplierId, input.grnId, input.invoiceId ?? null, input.returnDate ?? new Date().toISOString().slice(0, 10), input.reason ?? null, input.remarks ?? null, req.auth?.userId ?? null],
    );
    const ret = returnResult.rows[0];
    let grand = 0;
    for (const item of input.items) {
      const { rows } = await client.query("select * from products where id = $1", [item.productId]);
      const product = rows[0];
      if (!product) throw new Error(`Product ${item.productId} not found`);
      const lineTotal = round2(item.unitCost * item.quantity);
      grand += lineTotal;
      await client.query(
        `insert into pr_items (return_id, grn_item_id, product_id, sku, name, quantity, unit_cost, line_total, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ret.id, item.grnItemId ?? null, item.productId, product.sku, product.name, item.quantity, item.unitCost, lineTotal, item.reason ?? input.reason ?? null],
      );
    }
    grand = Math.round(grand);
    await client.query("update purchase_returns set grand_total = $2 where id = $1", [ret.id, grand]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', 'Created Purchase Return', $2, 'Purchase Return', $3, $4)", [req.auth?.userId ?? null, ret.id, JSON.stringify({ returnNumber: ret.return_number, total: grand }), `Purchase return ${ret.return_number} created — ₹${grand}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: ret });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

purchasesRouter.get("/api/purchase-returns/:id", authenticate, requirePermission("purchase.return.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const returnResult = await pool.query(
      `select r.*, r.grand_total::float8 as grand_total, s.name as supplier_name, g.grn_number, i.pi_number
       from purchase_returns r left join suppliers s on s.id = r.supplier_id left join grns g on g.id = r.grn_id left join purchase_invoices i on i.id = r.invoice_id where r.id = $1`, [req.params.id],
    );
    const ret = returnResult.rows[0];
    if (!ret) return res.status(404).json({ success: false, message: "Purchase return not found" });
    const itemsResult = await pool.query("select it.*, it.quantity::float8 as quantity, it.unit_cost::float8 as unit_cost, it.line_total::float8 as line_total from pr_items it where it.return_id = $1 order by it.created_at", [ret.id]);
    res.json({ success: true, data: { purchaseReturn: ret, items: itemsResult.rows } });
  } catch (error) { next(error); }
});

// Approve return → atomic: decrease stock, stock movement, supplier adjustment.
purchasesRouter.post("/api/purchase-returns/:id/status", authenticate, requirePermission("purchase.return.view"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ action: z.enum(["Approve", "Cancel"]), reason: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid return action", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { action, reason } = parsed.data;
  const perm = action === "Approve" ? "purchase.return.approve" : "purchase.order.cancel";
  if (!(req.auth?.permissions.has("*") || req.auth?.permissions.has(perm))) return res.status(403).json({ success: false, message: `Missing permission: ${perm}` });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const returnResult = await client.query("select * from purchase_returns where id = $1 for update", [req.params.id]);
    const ret = returnResult.rows[0];
    if (!ret) throw new Error("Purchase return not found");
    if (action === "Approve" && ret.status !== "Draft") throw new Error(`Only draft returns can be approved (current: ${ret.status})`);
    const nextStatus = action === "Approve" ? "Approved" : "Cancelled";
    if (action === "Approve") {
      const itemsResult = await client.query("select * from pr_items where return_id = $1", [ret.id]);
      for (const item of itemsResult.rows) {
        if (item.product_id) {
          const returnQty = Math.round(Number(item.quantity));
          const updated = await client.query("update products set stock_qty = greatest(0, stock_qty - $1), stock_updated_at = now() where id = $2 returning stock_qty", [returnQty, item.product_id]);
          await client.query("insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, notes, created_by) values ($1, 'Purchase Return', $2, $3, $4, 'Return', $5, $6)", [item.product_id, -returnQty, updated.rows[0].stock_qty, ret.return_number, `Returned ${returnQty} of ${item.name}`, req.auth?.userId ?? null]);
        }
      }
      await client.query("update suppliers set total_purchases = greatest(0, total_purchases - $1), outstanding_balance = greatest(0, outstanding_balance - $1) where id = $2", [Number(ret.grand_total), ret.supplier_id]);
    }
    const updated = await client.query(`update purchase_returns set status = $2, ${action === "Approve" ? "approved_at = now(), approved_by = $3" : "cancelled_at = now(), cancelled_by = $3"}, remarks = coalesce($4, remarks) where id = $1 returning *`, [ret.id, nextStatus, req.auth?.userId ?? null, reason ?? null]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Purchases', $2, $3, 'Purchase Return', $4, $5)", [req.auth?.userId ?? null, `${pastTense(action)} Purchase Return`, ret.id, JSON.stringify({ returnNumber: ret.return_number, toStatus: nextStatus }), `Purchase return ${ret.return_number} ${pastTense(action).toLowerCase()}`]);
    await client.query("commit");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Purchases summary for the module's top stat strip.
purchasesRouter.get("/api/purchases/summary", authenticate, requirePermission("purchase.order.view"), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(`
      select
        (select count(*) from purchase_orders where status = 'Draft' or status = 'Submitted')::int as pending_pos,
        (select count(*) from purchase_orders where status in ('Approved', 'Ordered', 'Partially Received'))::int as pending_receipts,
        (select count(*) from purchase_invoices where status = 'Draft')::int as pending_invoices,
        coalesce((select sum(outstanding_balance) from purchase_invoices where status not in ('Cancelled', 'Paid')), 0)::float8 as outstanding,
        coalesce((select sum(grand_total) from purchase_invoices where status not in ('Cancelled', 'Draft')), 0)::float8 as total_purchases,
        (select count(*) from grns where status = 'Draft')::int as draft_grns
    `);
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});
