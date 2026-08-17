import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { createShopifyClient, ShopifyApiError } from "@repo/shopify";
import { env } from "@repo/config/env";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission, type AuthenticatedRequest } from "../middleware/authorization.js";

export const customersRouter: RouterType = Router();

const customerSchema = z.object({
  name: z.string().trim().min(1),
  mobile: z.string().trim().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  gst_number: z.string().trim().nullable().optional(),
  customer_type: z.string().trim().default("Retail"),
  billing_address: z.string().trim().nullable().optional(),
  shipping_address: z.string().trim().nullable().optional(),
  credit_limit: z.number().nonnegative().default(0),
  date_of_birth: z.string().date().nullable().optional(),
  address_line1: z.string().trim().nullable().optional(),
  address_line2: z.string().trim().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  state: z.string().trim().nullable().optional(),
  country: z.string().trim().nullable().optional(),
  pin_code: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const customerSearchQuery = `query CustomerSearch($q: String!) { customers(first: 10, query: $q) { edges { node { id displayName firstName lastName email phone numberOfOrders amountSpent { amount } } } } }`;
type ShopifyCustomerSearchResponse = { customers: { edges: { node: { id: string; displayName: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; numberOfOrders: string; amountSpent: { amount: string } } }[] } };

function shopifyConfig() {
  if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_ADMIN_ACCESS_TOKEN) return null;
  return {
    storeDomain: env.SHOPIFY_STORE_DOMAIN,
    accessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    apiVersion: env.SHOPIFY_API_VERSION,
    ...(env.SHOPIFY_LOCATION_ID ? { locationId: env.SHOPIFY_LOCATION_ID } : {}),
  };
}

function shopifyClientOrThrow() {
  const config = shopifyConfig();
  if (!config) throw new ShopifyApiError("Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.");
  return createShopifyClient(config);
}

customersRouter.get("/api/customers", authenticate, requirePermission("sales.customer.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const source = String(req.query.source || "all");
    const status = String(req.query.status || "all");
    const purchase = String(req.query.purchase || "all");
    const outstanding = String(req.query.outstanding || "all");
    const q = String(req.query.q || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { rows } = await pool.query(
      `with base as (
         select c.id, c.customer_code, c.name, c.mobile, c.email, c.gst_number, c.customer_type,
           c.billing_address, c.shipping_address, c.credit_limit::float8 as credit_limit,
           c.outstanding_balance::float8 as outstanding_balance, c.loyalty_points,
           c.total_purchases::float8 as total_purchases, c.notes, c.shopify_customer_id,
           c.created_at, c.updated_at, c.status, c.date_of_birth,
           c.address_line1, c.address_line2, c.city, c.state, c.country, c.pin_code,
           c.shopify_status, c.last_shopify_sync_at,
           count(i.id) filter (where i.status <> 'Cancelled')::int as invoice_count,
           coalesce(sum(i.amount_paid) filter (where i.status <> 'Cancelled'), 0)::float8 as total_paid,
           null::int as shopify_total_orders,
           case when c.shopify_customer_id is null then 'Internal'
                when exists (select 1 from shopify_customers sc where sc.shopify_customer_id = c.shopify_customer_id) then 'Linked'
                else 'Shopify' end as source
         from customers c
         left join invoices i on i.customer_id = c.id
         group by c.id
         union all
         select sc.id, null::text as customer_code, sc.name, sc.mobile, sc.email, null::text as gst_number,
           'Retail'::text as customer_type, null::text as billing_address, null::text as shipping_address,
           0::float8 as credit_limit, 0::float8 as outstanding_balance, 0 as loyalty_points,
           sc.total_spent::float8 as total_purchases, null::text as notes, sc.shopify_customer_id,
           sc.synced_at as created_at, sc.synced_at as updated_at, 'Active'::text as status,
           null::date as date_of_birth, null::text as address_line1, null::text as address_line2,
           null::text as city, null::text as state, null::text as country, null::text as pin_code,
           'Active'::text as shopify_status, sc.synced_at as last_shopify_sync_at,
           0::int as invoice_count, 0::float8 as total_paid, sc.total_orders as shopify_total_orders,
           'Shopify'::text as source
         from shopify_customers sc
         where not exists (select 1 from customers c where c.shopify_customer_id = sc.shopify_customer_id)
       )
       select * from base
       where ($1 = 'all' or source = $1)
         and ($2 = 'all' or status = $2)
         and ($3 = 'all' or ($3 = 'has_purchases' and invoice_count > 0) or ($3 = 'no_purchases' and invoice_count = 0))
         and ($4 = 'all' or ($4 = 'full_paid' and outstanding_balance = 0) or ($4 = 'has_outstanding' and outstanding_balance > 0))
         and ($5 = '' or lower(name) like '%' || $5 || '%' or lower(coalesce(mobile, '')) like '%' || $5 || '%' or lower(coalesce(email, '')) like '%' || $5 || '%' or lower(coalesce(customer_code, '')) like '%' || $5 || '%')
       order by created_at desc
       limit $6 offset $7`,
      [source, status === "all" ? "all" : status === "active" ? "Active" : "Inactive", purchase, outstanding, q, limit, offset],
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

customersRouter.post("/api/customers", authenticate, requirePermission("sales.customer.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid customer payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const c = parsed.data;
    const duplicate = (await client.query(
      "select * from customers where ($1 <> '' and mobile = $1) or ($2 <> '' and lower(email) = lower($2)) order by created_at limit 1",
      [c.mobile ?? "", c.email ?? ""],
    )).rows[0];
    if (duplicate) {
      await client.query("rollback");
      client.release();
      return res.status(409).json({ success: false, message: `A customer already exists with this mobile or email: ${duplicate.name} (${duplicate.customer_code || duplicate.id})`, data: duplicate });
    }
    const { rows } = await client.query(
      `insert into customers (name, mobile, email, gst_number, customer_type, billing_address, shipping_address, credit_limit, date_of_birth, address_line1, address_line2, city, state, country, pin_code, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
      [c.name, c.mobile || null, c.email || null, c.gst_number || null, c.customer_type, c.billing_address || null, c.shipping_address || null, c.credit_limit, c.date_of_birth || null, c.address_line1 || null, c.address_line2 || null, c.city || null, c.state || null, c.country || null, c.pin_code || null, c.notes || null],
    );
    const customer = rows[0];
    await client.query("insert into activity_logs (user_id, module, action, record_type, record_id, new_value, remarks) values ($1, 'Customer', 'Created customer', 'Customer', $2, $3, $4)", [req.auth?.userId ?? null, customer.id, JSON.stringify({ name: customer.name, customerCode: customer.customer_code, mobile: customer.mobile, email: customer.email }), `Customer ${customer.customer_code} (${customer.name}) created`]);
    await client.query("commit");
    client.release();
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    client.release();
    next(error);
  }
});

customersRouter.get("/api/customers/export", authenticate, requirePermission("sales.customer.export"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(
      `select c.customer_code, c.name, c.mobile, c.email, c.gst_number, c.customer_type, c.status,
         c.city, c.state, c.country, c.pin_code,
         c.total_purchases::float8 as total_purchases, c.outstanding_balance::float8 as outstanding_balance,
         c.created_at,
         case when c.shopify_customer_id is null then 'Internal'
              when exists (select 1 from shopify_customers sc where sc.shopify_customer_id = c.shopify_customer_id) then 'Linked'
              else 'Shopify' end as source
       from customers c order by c.created_at`,
    );
    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ["Customer Code", "Name", "Mobile", "Email", "GSTIN", "Type", "Status", "City", "State", "Country", "PIN Code", "Total Purchases", "Outstanding", "Source", "Created At"];
    const lines = [header.join(","), ...rows.map((row) => [row.customer_code, row.name, row.mobile, row.email, row.gst_number, row.customer_type, row.status, row.city, row.state, row.country, row.pin_code, row.total_purchases, row.outstanding_balance, row.source, row.created_at].map(escapeCsv).join(","))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="customers.csv"');
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

customersRouter.get("/api/customers/shopify-list", authenticate, requirePermission("sales.customer.link_shopify"), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(
      `select sc.*, sc.total_spent::float8 as total_spent
       from shopify_customers sc
       where not exists (select 1 from customers c where c.shopify_customer_id = sc.shopify_customer_id)
       order by sc.synced_at desc`,
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

customersRouter.get("/api/customers/shopify-search", authenticate, requirePermission("sales.customer.view"), async (req, res, next) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ success: false, message: "Search query is required" });
  try {
    const client = shopifyClientOrThrow();
    const escaped = q.replace(/([()\\:"])/g, "\\$1");
    const filter = `(name:*${escaped}* OR email:${escaped}* OR phone:${escaped}*)`;
    const data = await client.query<ShopifyCustomerSearchResponse>(customerSearchQuery, { q: filter });
    const results = data.customers.edges.map((edge) => ({
      shopifyCustomerId: edge.node.id,
      name: edge.node.displayName || [edge.node.firstName, edge.node.lastName].filter(Boolean).join(" ") || "Shopify Customer",
      email: edge.node.email,
      phone: edge.node.phone,
      totalOrders: Number(edge.node.numberOfOrders),
      totalSpent: Number(edge.node.amountSpent.amount),
    }));
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

customersRouter.post("/api/customers/import-shopify", authenticate, requirePermission("sales.customer.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    shopifyCustomerId: z.string().min(1),
    name: z.string().trim().min(1),
    email: z.string().trim().email().nullable().optional(),
    phone: z.string().trim().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid Shopify customer payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = (await client.query("select * from customers where shopify_customer_id = $1 limit 1", [input.shopifyCustomerId])).rows[0];
    if (existing) {
      await client.query("rollback");
      client.release();
      return res.json({ success: true, data: existing });
    }
    await client.query("insert into shopify_customers (shopify_customer_id, name, mobile, email, synced_at) values ($1,$2,$3,$4,now()) on conflict (shopify_customer_id) do update set name = excluded.name, mobile = excluded.mobile, email = excluded.email, synced_at = now()", [input.shopifyCustomerId, input.name, input.phone ?? null, input.email ?? null]);
    const match = (await client.query("select * from customers where ($1 <> '' and mobile = $1) or ($2 <> '' and lower(email) = lower($2)) order by created_at limit 1", [input.phone ?? "", input.email ?? ""])).rows[0];
    if (match) {
      await client.query("update customers set shopify_customer_id = $1, shopify_status = 'Active', last_shopify_sync_at = now() where id = $2", [input.shopifyCustomerId, match.id]);
      await client.query("insert into activity_logs (user_id, module, action, record_type, record_id, new_value, remarks) values ($1, 'Customer', 'Linked Shopify customer', 'Customer', $2, $3, $4)", [req.auth?.userId ?? null, match.id, JSON.stringify({ shopifyCustomerId: input.shopifyCustomerId }), `Linked Shopify customer ${input.shopifyCustomerId} with ${match.customer_code} (${match.name})`]);
      await client.query("commit");
      client.release();
      return res.status(201).json({ success: true, data: match });
    }
    const { rows } = await client.query("insert into customers (name, mobile, email, shopify_customer_id, shopify_status, last_shopify_sync_at) values ($1,$2,$3,$4,'Active',now()) returning *", [input.name, input.phone ?? null, input.email ?? null, input.shopifyCustomerId]);
    const customer = rows[0];
    await client.query("insert into activity_logs (user_id, module, action, record_type, record_id, new_value, remarks) values ($1, 'Customer', 'Imported Shopify customer', 'Customer', $2, $3, $4)", [req.auth?.userId ?? null, customer.id, JSON.stringify({ shopifyCustomerId: input.shopifyCustomerId, name: customer.name }), `Imported Shopify customer ${input.shopifyCustomerId} as ${customer.customer_code}`]);
    await client.query("commit");
    client.release();
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    client.release();
    next(error);
  }
});

customersRouter.get("/api/customers/:id", authenticate, requirePermission("sales.customer.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const customerResult = await pool.query(
      `select c.*, c.credit_limit::float8 as credit_limit, c.outstanding_balance::float8 as outstanding_balance,
        c.total_purchases::float8 as total_purchases,
        case when c.shopify_customer_id is null then 'Internal'
             when exists (select 1 from shopify_customers sc where sc.shopify_customer_id = c.shopify_customer_id) then 'Linked'
             else 'Shopify' end as source
       from customers c where c.id = $1`,
      [req.params.id],
    );
    const customer = customerResult.rows[0];
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    const summaryResult = await pool.query(
      `select count(*)::int as orders,
         coalesce(sum(i.grand_total), 0)::float8 as total_purchases,
         coalesce(sum(i.amount_paid), 0)::float8 as total_paid,
         coalesce(sum(i.outstanding_balance), 0)::float8 as outstanding
       from invoices i where i.customer_id = $1 and i.status <> 'Cancelled'`,
      [req.params.id],
    );
    const invoicesResult = await pool.query(
      `select i.*, i.subtotal::float8 as subtotal, i.discount::float8 as discount, i.gst_amount::float8 as gst_amount,
        i.round_off::float8 as round_off, i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid,
        i.outstanding_balance::float8 as outstanding_balance, i.silver_rate::float8 as silver_rate,
        (select count(*) from invoice_items it where it.invoice_id = i.id)::int as item_count
       from invoices i where i.customer_id = $1 order by i.created_at desc limit 50`,
      [req.params.id],
    );
    const paymentsResult = await pool.query(
      `select p.*, p.amount::float8 as amount from payments p where p.party_id = $1 and p.direction = 'Incoming' order by p.created_at desc limit 50`,
      [req.params.id],
    );
    const shopifyResult = customer.shopify_customer_id
      ? (await pool.query("select sc.*, sc.total_spent::float8 as total_spent from shopify_customers sc where sc.shopify_customer_id = $1", [customer.shopify_customer_id])).rows[0] ?? null
      : null;
    res.json({
      success: true,
      data: {
        customer,
        summary: summaryResult.rows[0],
        invoices: invoicesResult.rows,
        payments: paymentsResult.rows,
        shopifyCustomer: shopifyResult,
      },
    });
  } catch (error) {
    next(error);
  }
});

customersRouter.put("/api/customers/:id", authenticate, requirePermission("sales.customer.edit"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid customer payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const entries = Object.entries(parsed.data);
  if (!entries.length) return res.status(400).json({ success: false, message: "No customer fields supplied" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = (await client.query("select * from customers where id = $1", [req.params.id])).rows[0];
    if (!existing) {
      await client.query("rollback");
      client.release();
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    const values = entries.map(([, value]) => value ?? null);
    const set = entries.map(([key], index) => `${key} = $${index + 1}`).join(", ");
    const { rows } = await client.query(`update customers set ${set} where id = $${values.length + 1} returning *`, [...values, req.params.id]);
    await client.query("insert into activity_logs (user_id, module, action, record_type, record_id, previous_value, new_value, remarks) values ($1, 'Customer', 'Updated customer', 'Customer', $2, $3, $4, $5)", [req.auth?.userId ?? null, req.params.id, JSON.stringify(entries.reduce((acc, [k, v]) => ({ ...acc, [k]: existing[k] }), {})), JSON.stringify(rows[0]), `Customer ${rows[0].customer_code} (${rows[0].name}) updated`]);
    await client.query("commit");
    client.release();
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    client.release();
    next(error);
  }
});

customersRouter.post("/api/customers/:id/status", authenticate, requirePermission("sales.customer.deactivate"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ status: z.enum(["Active", "Inactive"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Status must be Active or Inactive", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query("update customers set status = $1 where id = $2 returning *", [parsed.data.status, req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: "Customer not found" });
    await pool.query("insert into activity_logs (user_id, module, action, record_type, record_id, previous_value, new_value, remarks) values ($1, 'Customer', $2, 'Customer', $3, $4, $5, $6)", [req.auth?.userId ?? null, parsed.data.status === "Active" ? "Activated customer" : "Deactivated customer", req.params.id, JSON.stringify({ status: parsed.data.status === "Active" ? "Inactive" : "Active" }), JSON.stringify({ status: parsed.data.status }), `Customer ${rows[0].customer_code} (${rows[0].name}) ${parsed.data.status === "Active" ? "activated" : "deactivated"}`]);
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

customersRouter.post("/api/customers/:id/shopify-link", authenticate, requirePermission("sales.customer.link_shopify"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    shopifyCustomerId: z.string().min(1).nullable().optional(),
    unlink: z.boolean().optional(),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid link payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const customer = (await client.query("select * from customers where id = $1", [req.params.id])).rows[0];
    if (!customer) {
      await client.query("rollback");
      client.release();
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    if (parsed.data.unlink) {
      await client.query("update customers set shopify_customer_id = null, shopify_status = null, last_shopify_sync_at = null where id = $1", [req.params.id]);
      await client.query("insert into activity_logs (user_id, module, action, record_type, record_id, previous_value, new_value, remarks) values ($1, 'Customer', 'Unlinked Shopify customer', 'Customer', $2, $3, $4, $5)", [req.auth?.userId ?? null, req.params.id, JSON.stringify({ shopifyCustomerId: customer.shopify_customer_id }), JSON.stringify({ shopifyCustomerId: null }), `Unlinked Shopify customer from ${customer.customer_code} (${customer.name})`]);
      await client.query("commit");
      client.release();
      return res.json({ success: true, data: { ...customer, shopify_customer_id: null } });
    }
    const shopifyId = parsed.data.shopifyCustomerId;
    if (!shopifyId) {
      await client.query("rollback");
      client.release();
      return res.status(400).json({ success: false, message: "shopifyCustomerId is required" });
    }
    const conflict = (await client.query("select id, name, customer_code from customers where shopify_customer_id = $1 and id <> $2", [shopifyId, req.params.id])).rows[0];
    if (conflict) {
      await client.query("rollback");
      client.release();
      return res.status(409).json({ success: false, message: `Shopify customer is already linked to ${conflict.customer_code} (${conflict.name})` });
    }
    const shopifyRecord = (await client.query("select * from shopify_customers where shopify_customer_id = $1", [shopifyId])).rows[0];
    await client.query("update customers set shopify_customer_id = $1, shopify_status = $2, last_shopify_sync_at = now() where id = $3", [shopifyId, shopifyRecord?.status ?? "Active", req.params.id]);
    const { rows } = await client.query("select * from customers where id = $1", [req.params.id]);
    await client.query("insert into activity_logs (user_id, module, action, record_type, record_id, previous_value, new_value, remarks) values ($1, 'Customer', 'Linked Shopify customer', 'Customer', $2, $3, $4, $5)", [req.auth?.userId ?? null, req.params.id, JSON.stringify({ shopifyCustomerId: customer.shopify_customer_id }), JSON.stringify({ shopifyCustomerId: shopifyId }), `Linked Shopify customer ${shopifyId} with ${customer.customer_code} (${customer.name})`]);
    await client.query("commit");
    client.release();
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    client.release();
    next(error);
  }
});
