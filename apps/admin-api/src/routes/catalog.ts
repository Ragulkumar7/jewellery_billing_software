import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission, type AuthenticatedRequest } from "../middleware/authorization.js";
import { listStockMovements } from "../services/stock-movements.js";

export const catalogRouter: RouterType = Router();

const productSchema = z.object({
  name: z.string().trim().min(1), sku: z.string().trim().min(1), barcode: z.string().trim().nullable().optional(),
  category: z.string().trim().min(1).default("Silver"), collection: z.string().trim().nullable().optional(),
  purity: z.string().trim().min(1).default("92.5"), gross_weight: z.number().nonnegative().default(0),
  net_weight: z.number().nonnegative().default(0), stone_weight: z.number().nonnegative().default(0),
  making_charge: z.number().nonnegative().default(0), stone_charge: z.number().nonnegative().default(0),
  other_charge: z.number().nonnegative().default(0), hallmark: z.string().trim().nullable().optional(),
  gst_rate: z.number().nonnegative().default(3), stock_qty: z.number().int().nonnegative().default(0),
  min_stock_qty: z.number().int().nonnegative().default(5), status: z.enum(["Active", "Inactive"]).default("Active"),
});
catalogRouter.get("/api/products", authenticate, requirePermission("inventory.product.view"), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(`
      select p.*,
        p.gross_weight::float8 as gross_weight,
        p.net_weight::float8 as net_weight,
        p.stone_weight::float8 as stone_weight,
        p.making_charge::float8 as making_charge,
        p.stone_charge::float8 as stone_charge,
        p.other_charge::float8 as other_charge,
        p.gst_rate::float8 as gst_rate
      from products p
      where p.status = 'Active'
      order by p.name
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

catalogRouter.post("/api/products", authenticate, requirePermission("inventory.product.create"), async (req, res, next) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid product payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const p = parsed.data;
    const { rows } = await pool.query(
      `insert into products (name, sku, barcode, category, collection, purity, gross_weight, net_weight, stone_weight, making_charge, stone_charge, other_charge, hallmark, gst_rate, stock_qty, min_stock_qty, status, stock_updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()) returning *`,
      [p.name, p.sku, p.barcode || null, p.category, p.collection || null, p.purity, p.gross_weight, p.net_weight, p.stone_weight, p.making_charge, p.stone_charge, p.other_charge, p.hallmark || null, p.gst_rate, p.stock_qty, p.min_stock_qty, p.status],
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

catalogRouter.put("/api/products/:id", authenticate, requirePermission("inventory.product.edit"), async (req, res, next) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid product payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const entries = Object.entries(parsed.data);
  if (!entries.length) return res.status(400).json({ success: false, message: "No product fields supplied" });
  try {
    const values = entries.map(([, value]) => value ?? null);
    const set = entries.map(([key], index) => `${key} = $${index + 1}`).join(", ");
    const { rows } = await pool.query(`update products set ${set}, stock_updated_at = now() where id = $${values.length + 1} returning *`, [...values, req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).optional() });

async function deleteProductRows(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }, id: string) {
  await client.query("update invoice_items set product_id = null where product_id = $1", [id]);
  await client.query("delete from stock_movements where product_id = $1", [id]);
  await client.query("delete from product_price_snapshots where product_id = $1", [id]);
  await client.query("delete from products where id = $1", [id]);
}

catalogRouter.delete("/api/products/:id", authenticate, requirePermission("inventory.product.archive"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    const id = String(req.params.id);
    await client.query("begin");
    const { rows } = await client.query("select id from products where id = $1", [id]);
    if (!rows[0]) {
      await client.query("rollback");
      client.release();
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    await deleteProductRows(client, id);
    await client.query("insert into activity_logs (user_id, module, action, record_type, record_id, new_value, remarks) values ($1, 'Inventory', 'Deleted product', 'Products', $2, $3, $4)", [req.auth?.userId ?? null, id, JSON.stringify({ id }), `Deleted product ${id}`]);
    await client.query("commit");
    client.release();
    res.json({ success: true, data: { id } });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    client.release();
    return next(error);
  }
});

catalogRouter.post("/api/products/bulk-delete", authenticate, requirePermission("inventory.product.archive"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = bulkDeleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid bulk delete payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const targetIds = parsed.data.ids?.length
      ? (await client.query("select id from products where id = any($1::uuid[])", [parsed.data.ids])).rows.map((row) => (row as { id: string }).id)
      : (await client.query("select id from products")).rows.map((row) => (row as { id: string }).id);
    for (const id of targetIds) {
      await deleteProductRows(client, id);
    }
    await client.query("insert into activity_logs (user_id, module, action, record_type, new_value, remarks) values ($1, 'Inventory', 'Deleted products', 'Products', $2, $3)", [req.auth?.userId ?? null, JSON.stringify({ deleted: targetIds.length }), `Deleted ${targetIds.length} product(s)`]);
    await client.query("commit");
    client.release();
    res.json({ success: true, data: { deleted: targetIds.length } });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    client.release();
    return next(error);
  }
});

catalogRouter.get("/api/products/:id/movements", authenticate, requirePermission("inventory.product.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const limit = Number(req.query.limit);
    const data = await listStockMovements(pool, {
      productId: req.params.id,
      movementType: req.query.movementType ? String(req.query.movementType) : null,
      startDate: req.query.from ? String(req.query.from) : null,
      endDate: req.query.to ? String(req.query.to) : null,
      limit: Number.isFinite(limit) ? limit : null,
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

catalogRouter.get("/api/invoices", authenticate, requirePermission("sales.invoice.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const source = req.query.source ? String(req.query.source) : null;
    const payment = req.query.payment ? String(req.query.payment) : null;
    const customerId = req.query.customerId ? String(req.query.customerId) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const q = req.query.q ? String(req.query.q).trim() : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
    if (source) { params.push(source); conditions.push(`i.source = $${params.length}`); }
    if (payment) { params.push(payment); conditions.push(`i.payment_status = $${params.length}`); }
    if (customerId) { params.push(customerId); conditions.push(`i.customer_id = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`i.invoice_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`i.invoice_date <= $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(i.invoice_number ilike $${params.length} or i.customer_name ilike $${params.length} or i.customer_mobile ilike $${params.length} or i.shopify_order_id ilike $${params.length}
        or c.email ilike $${params.length}
        or exists (select 1 from invoice_items ii where ii.invoice_id = i.id and (ii.sku ilike $${params.length} or ii.name ilike $${params.length})))`);
    }
    params.push(limit, offset);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select i.*,
        i.subtotal::float8 as subtotal, i.discount::float8 as discount,
        i.gst_amount::float8 as gst_amount, i.round_off::float8 as round_off,
        i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid,
        i.outstanding_balance::float8 as outstanding_balance, i.silver_rate::float8 as silver_rate,
        (select count(*) from invoice_items ii where ii.invoice_id = i.id) as item_count,
        c.email, c.shopify_customer_id
      from invoices i left join customers c on c.id = i.customer_id${where}
      order by i.created_at desc limit $${params.length - 1} offset $${params.length}
    `, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});
