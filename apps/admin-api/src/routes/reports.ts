import { Router, type Router as RouterType } from "express";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission } from "../middleware/authorization.js";

export const reportsRouter: RouterType = Router();

function stringParam(req: { query: Record<string, unknown> }, key: string): string {
  return req.query[key] !== undefined && req.query[key] !== null ? String(req.query[key]) : "";
}

// Builds a date-range + optional source WHERE fragment with parameterized values.
// Returns { cond, params } where cond is SQL that can be embedded (joined with " and ") and params are bound in order.
function dateSourceConds(from: string, to: string, source: string, dateCol: string, sourceCol: string): { cond: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (from) { params.push(from); parts.push(`${dateCol} >= $${params.length}`); }
  if (to) { params.push(to); parts.push(`${dateCol} <= $${params.length}`); }
  if (source) { params.push(source); parts.push(`${sourceCol} = $${params.length}`); }
  return { cond: parts.length ? parts.join(" and ") : "1 = 1", params };
}

async function currentSilverRate(): Promise<number> {
  if (!pool) return 92.8;
  const { rows } = await pool.query("select rate_per_gram from silver_rates order by effective_date desc, effective_time desc, created_at desc limit 1");
  return Number(rows[0]?.rate_per_gram || 92.8);
}

// ---------- Sales Report ----------

reportsRouter.get("/api/reports/sales", authenticate, requirePermission("reports.sales.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const from = stringParam(req, "from");
    const to = stringParam(req, "to");
    const customer = stringParam(req, "customer");
    const product = stringParam(req, "product");
    const category = stringParam(req, "category");
    const source = stringParam(req, "source");
    const status = stringParam(req, "invoiceStatus");
    const paymentStatus = stringParam(req, "paymentStatus");
    const salesperson = stringParam(req, "salesperson");

    // Invoice-level filter (confirmed sales only).
    const conds: string[] = ["i.status <> 'Draft'", "i.status <> 'Cancelled'", "i.status <> 'Returned'"];
    const params: unknown[] = [];
    if (from) { params.push(from); conds.push(`i.invoice_date >= $${params.length}`); }
    if (to) { params.push(to); conds.push(`i.invoice_date <= $${params.length}`); }
    if (customer) { params.push(customer); conds.push(`i.customer_id = $${params.length}`); }
    if (source) { params.push(source); conds.push(`i.source = $${params.length}`); }
    if (status) { params.push(status); conds.push(`i.status = $${params.length}`); }
    if (paymentStatus) { params.push(paymentStatus); conds.push(`i.payment_status = $${params.length}`); }
    if (salesperson) { params.push(salesperson); conds.push(`u.id = $${params.length}`); }
    if (product) { params.push(product); conds.push(`exists (select 1 from invoice_items x where x.invoice_id = i.id and x.product_id = $${params.length})`); }
    if (category) { params.push(category); conds.push(`exists (select 1 from invoice_items x join products px on px.id = x.product_id where x.invoice_id = i.id and px.category = $${params.length})`); }
    const where = ` where ${conds.join(" and ")}`;

    const [summaryRes, invoicesRes, productRes, categoryRes, customerRes, sourceRes, returnsRes, refundsRes, itemsRes] = await Promise.all([
      pool.query(`
        select count(*)::int as invoice_count,
          coalesce(sum(i.subtotal + i.discount),0)::float8 as gross_sales,
          coalesce(sum(i.discount),0)::float8 as discounts,
          coalesce(sum(i.gst_amount),0)::float8 as tax,
          coalesce(sum(i.grand_total),0)::float8 as grand_total,
          coalesce(sum(i.subtotal),0)::float8 as net_sales,
          coalesce(sum(i.amount_paid),0)::float8 as paid,
          coalesce(sum(i.outstanding_balance),0)::float8 as outstanding
        from invoices i left join users u on u.id = i.confirmed_by${where}`, params),
      pool.query(`
        select i.id, i.invoice_number, i.invoice_date::text as invoice_date, i.customer_name, i.customer_id,
          i.status, i.payment_status, i.payment_method, i.source,
          i.subtotal::float8 as subtotal, i.discount::float8 as discount, i.gst_amount::float8 as gst_amount,
          i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid,
          i.outstanding_balance::float8 as outstanding_balance, i.silver_rate::float8 as silver_rate,
          u.name as salesperson,
          (select count(*) from invoice_items it where it.invoice_id = i.id)::int as item_count,
          (select coalesce(sum(it.quantity),0) from invoice_items it where it.invoice_id = i.id)::int as items_sold
        from invoices i left join users u on u.id = i.confirmed_by${where}
        order by i.invoice_date desc, i.created_at desc limit 500`, params),
      pool.query(`
        select coalesce(it.name, 'Unknown') as name, coalesce(it.sku, '') as sku,
          sum(it.quantity)::int as qty_sold, coalesce(sum(it.line_total),0)::float8 as sales,
          coalesce(sum(it.net_weight * it.quantity),0)::float8 as weight_sold
        from invoices i join invoice_items it on it.invoice_id = i.id${where}
        group by coalesce(it.name, 'Unknown'), coalesce(it.sku, '') order by sales desc limit 200`, params),
      pool.query(`
        select coalesce(px.category, 'Uncategorized') as category,
          sum(it.quantity)::int as qty_sold, coalesce(sum(it.line_total),0)::float8 as sales
        from invoices i join invoice_items it on it.invoice_id = i.id left join products px on px.id = it.product_id${where}
        group by coalesce(px.category, 'Uncategorized') order by sales desc`, params),
      pool.query(`
        select i.customer_name as customer, count(*)::int as orders, coalesce(sum(i.grand_total),0)::float8 as total_sales
        from invoices i${where}
        group by i.customer_name order by total_sales desc`, params),
      pool.query(`
        select i.source, count(*)::int as orders, coalesce(sum(i.grand_total),0)::float8 as sales
        from invoices i${where}
        group by i.source`, params),
      pool.query(`
        select coalesce(sum(i.grand_total),0)::float8 as returns_value, count(*)::int as returns_count
        from invoices i where i.status = 'Returned'
          ${from ? ` and i.invoice_date >= $1` : ""} ${to ? ` and i.invoice_date <= $2` : ""}`,
        [from ? from : null, to ? to : null].filter((v) => v !== null)),
      pool.query(`
        select coalesce(sum(p.amount),0)::float8 as refunds, count(*)::int as refunds_count
        from payments p where p.payment_type = 'Refund' and p.status = 'Completed'
          ${from ? ` and p.payment_date >= $1` : ""} ${to ? ` and p.payment_date <= $2` : ""}`,
        [from ? from : null, to ? to : null].filter((v) => v !== null)),
      pool.query(`
        select coalesce(sum(it.quantity),0)::int as items_sold
        from invoices i join invoice_items it on it.invoice_id = i.id${where}`, params),
    ]);

    const s = summaryRes.rows[0] || {};
    const invoiceCount = Number(s.invoice_count || 0);
    const netSales = Number(s.net_sales || 0);
    const returns = returnsRes.rows[0] || {};
    const refunds = refundsRes.rows[0] || {};
    const itemsSold = Number(itemsRes.rows[0]?.items_sold || 0);

    res.json({
      success: true,
      data: {
        summary: {
          grossSales: Number(s.gross_sales || 0),
          discounts: Number(s.discounts || 0),
          tax: Number(s.tax || 0),
          netSales,
          grandTotal: Number(s.grand_total || 0),
          invoiceCount,
          itemsSold,
          paid: Number(s.paid || 0),
          outstanding: Number(s.outstanding || 0),
          returns: Number(returns.returns_value || 0),
          returnsCount: Number(returns.returns_count || 0),
          refunds: Number(refunds.refunds || 0),
          refundsCount: Number(refunds.refunds_count || 0),
          avgInvoice: invoiceCount ? Math.round((netSales / invoiceCount) * 100) / 100 : 0,
        },
        invoices: invoicesRes.rows,
        productPerformance: productRes.rows,
        categoryPerformance: categoryRes.rows,
        customerPerformance: customerRes.rows,
        sourcePerformance: sourceRes.rows,
      },
    });
  } catch (error) { next(error); }
});

// ---------- Business Report ----------

reportsRouter.get("/api/reports/business", authenticate, requirePermission("reports.business.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const db = pool;
  try {
    const from = stringParam(req, "from");
    const to = stringParam(req, "to");
    // Default: this month to today.
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const monthStart = todayStr.slice(0, 8) + "01";
    const start = from || monthStart;
    const end = to || todayStr;
    const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
    const prevEnd = new Date(new Date(start).getTime() - 86400000).toISOString().slice(0, 10);
    const prevStart = new Date(new Date(prevEnd).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);

    async function periodMetrics(sf: string, st: string) {
      const [sales, purchases, expenses, returns, shopify] = await Promise.all([
        db.query(
          `select count(*)::int as orders, coalesce(sum(grand_total),0)::float8 as value, coalesce(sum(amount_paid),0)::float8 as collected,
             coalesce(sum(subtotal),0)::float8 as net_sales
           from invoices where status not in ('Draft','Cancelled','Returned') and invoice_date between $1 and $2`, [sf, st]),
        db.query(
          `select count(*)::int as orders, coalesce(sum(grand_total),0)::float8 as value
           from purchase_invoices where status in ('Approved','Partially Paid','Paid') and pi_date between $1 and $2`, [sf, st]),
        db.query(
          `select count(*)::int as count, coalesce(sum(amount),0)::float8 as value
           from expenses where status in ('Approved','Paid') and expense_date between $1 and $2`, [sf, st]),
        db.query(
          `select coalesce(sum(grand_total),0)::float8 as value, count(*)::int as count
           from invoices where status = 'Returned' and invoice_date between $1 and $2`, [sf, st]),
        db.query(
          `select count(*)::int as orders, coalesce(sum(amount),0)::float8 as value
           from shopify_orders where order_date between $1::timestamp and $2::timestamp`, [sf, st]),
      ]);
      return {
        sales: Number(sales.rows[0]?.value || 0),
        orders: Number(sales.rows[0]?.orders || 0),
        collected: Number(sales.rows[0]?.collected || 0),
        netSales: Number(sales.rows[0]?.net_sales || 0),
        returns: Number(returns.rows[0]?.value || 0),
        returnsCount: Number(returns.rows[0]?.count || 0),
        purchases: Number(purchases.rows[0]?.value || 0),
        purchaseOrders: Number(purchases.rows[0]?.orders || 0),
        expenses: Number(expenses.rows[0]?.value || 0),
        expenseCount: Number(expenses.rows[0]?.count || 0),
        shopifySales: Number(shopify.rows[0]?.value || 0),
        shopifyOrders: Number(shopify.rows[0]?.orders || 0),
      };
    }

    const [current, previous, balances, expenseCats, supplierPurchases, inventory, syncRes] = await Promise.all([
      periodMetrics(start, end),
      periodMetrics(prevStart, prevEnd),
      Promise.all([
        db.query(`select coalesce(sum(outstanding_balance),0)::float8 as receivables, count(*)::int as customers from customers where status = 'Active'`),
        db.query(`select coalesce(sum(outstanding_balance),0)::float8 as payables, count(*)::int as suppliers from suppliers where status = 'Active'`),
        db.query(`select count(*)::int as count from customers`),
        db.query(`select count(*)::int as count from suppliers`),
      ]),
      db.query(
        `select category, count(*)::int as count, coalesce(sum(amount),0)::float8 as amount
         from expenses where status in ('Approved','Paid') and expense_date between $1 and $2 group by category order by amount desc`, [start, end]),
      db.query(
        `select s.name as supplier, count(*)::int as invoices, coalesce(sum(i.grand_total),0)::float8 as purchases
         from purchase_invoices i left join suppliers s on s.id = i.supplier_id
         where i.status in ('Approved','Partially Paid','Paid') and i.pi_date between $1 and $2
         group by s.name order by purchases desc`, [start, end]),
      db.query(`select id, net_weight, making_charge, stock_qty from products where status = 'Active'`),
      db.query(`select status, count(*)::int as count from sync_logs group by status`),
    ]);

    const silverRate = await currentSilverRate();
    const inventoryValue = inventory.rows.reduce((sum, p) => sum + (Number(p.net_weight) * silverRate + Number(p.making_charge)) * Number(p.stock_qty), 0);
    const stockQty = inventory.rows.reduce((sum, p) => sum + Number(p.stock_qty), 0);
    const totalWeight = inventory.rows.reduce((sum, p) => sum + Number(p.net_weight) * Number(p.stock_qty), 0);

    const rec = balances[0].rows[0] || { receivables: 0, customers: 0 };
    const pay = balances[1].rows[0] || { payables: 0, suppliers: 0 };
    const customerCount = Number(balances[2].rows[0]?.count || 0);
    const supplierCount = Number(balances[3].rows[0]?.count || 0);

    const syncStatus: Record<string, number> = {};
    for (const row of syncRes.rows) syncStatus[row.status] = Number(row.count);

    const comparison = [
      { metric: "Sales", current: current.sales, previous: previous.sales },
      { metric: "Purchases", current: current.purchases, previous: previous.purchases },
      { metric: "Expenses", current: current.expenses, previous: previous.expenses },
      { metric: "Orders", current: current.orders, previous: previous.orders },
      { metric: "Shopify Sales", current: current.shopifySales, previous: previous.shopifySales },
    ].map((row) => {
      const change = row.previous ? ((row.current - row.previous) / row.previous) * 100 : row.current ? 100 : 0;
      return { ...row, changePct: Math.round(change * 10) / 10 };
    });

    res.json({
      success: true,
      data: {
        period: { from: start, to: end, previous: { from: prevStart, to: prevEnd } },
        current,
        previous,
        comparison,
        receivables: Number(rec.receivables || 0),
        payables: Number(pay.payables || 0),
        activeCustomers: Number(rec.customers || 0),
        totalCustomers: customerCount,
        activeSuppliers: Number(pay.suppliers || 0),
        totalSuppliers: supplierCount,
        inventory: { products: inventory.rows.length, stockQty, totalWeight, value: Math.round(inventoryValue * 100) / 100 },
        expenseByCategory: expenseCats.rows,
        purchaseBySupplier: supplierPurchases.rows,
        syncStatus,
      },
    });
  } catch (error) { next(error); }
});

// ---------- GST Report ----------

reportsRouter.get("/api/reports/gst", authenticate, requirePermission("reports.gst.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const from = stringParam(req, "from");
    const to = stringParam(req, "to");
    const conds: string[] = [];
    const params: unknown[] = [];
    if (from) { params.push(from); conds.push(`invoice_date >= $${params.length}`); }
    if (to) { params.push(to); conds.push(`invoice_date <= $${params.length}`); }
    const where = conds.length ? ` and ${conds.join(" and ")}` : "";

    const [salesRes, purchasesRes] = await Promise.all([
      pool.query(`
        select i.invoice_number, i.invoice_date::text as invoice_date, i.customer_name as party,
          i.subtotal::float8 as taxable_value, i.discount::float8 as discount,
          i.gst_amount::float8 as gst_amount, i.grand_total::float8 as grand_total, i.status
        from invoices i
        where i.status not in ('Draft','Cancelled','Returned')${where}
        order by i.invoice_date desc`, params),
      pool.query(`
        select i.pi_number, i.pi_date::text as pi_date, s.name as party,
          (i.subtotal - i.discount)::float8 as taxable_value, i.discount::float8 as discount,
          i.gst_amount::float8 as gst_amount, i.grand_total::float8 as grand_total, i.status
        from purchase_invoices i left join suppliers s on s.id = i.supplier_id
        where i.status in ('Approved','Partially Paid','Paid')
          ${from ? ` and i.pi_date >= $1` : ""} ${to ? ` and i.pi_date <= $2` : ""}
        order by i.pi_date desc`,
        [from ? from : null, to ? to : null].filter((v) => v !== null)),
    ]);

    const sales = salesRes.rows;
    const purchases = purchasesRes.rows;
    const sumTax = (rows: any[]) => rows.reduce((s, r) => s + Number(r.taxable_value || 0), 0);
    const sumGst = (rows: any[]) => rows.reduce((s, r) => s + Number(r.gst_amount || 0), 0);
    const salesGst = sumGst(sales);
    const purchaseGst = sumGst(purchases);

    res.json({
      success: true,
      data: {
        summary: {
          salesTaxable: sumTax(sales),
          salesCgst: Math.round((salesGst / 2) * 100) / 100,
          salesSgst: Math.round((salesGst / 2) * 100) / 100,
          salesIgst: 0,
          salesTotalGst: salesGst,
          purchaseTaxable: sumTax(purchases),
          purchaseCgst: Math.round((purchaseGst / 2) * 100) / 100,
          purchaseSgst: Math.round((purchaseGst / 2) * 100) / 100,
          purchaseIgst: 0,
          purchaseTotalGst: purchaseGst,
          netGst: Math.round((salesGst - purchaseGst) * 100) / 100,
        },
        sales,
        purchases,
      },
    });
  } catch (error) { next(error); }
});

// ---------- Sales Analytics ----------

reportsRouter.get("/api/reports/analytics", authenticate, requirePermission("reports.analytics.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const from = stringParam(req, "from");
    const to = stringParam(req, "to");
    const source = stringParam(req, "source");
    const period = stringParam(req, "period") || "monthly";
    const rawLimit = Number(req.query.limit || 5);
    const limit = Number.isFinite(rawLimit) ? Math.min(10, Math.max(1, Math.trunc(rawLimit))) : 5;
    const invConds = dateSourceConds(from, to, source, "i.invoice_date", "i.source");
    const baseConds = dateSourceConds(from, to, "", "invoice_date", "source");

    const [kpisRes, trendRes, productsRes, customersRes, categoriesRes, paymentsRes, sourcesRes, returnsRes] = await Promise.all([
      pool.query(`
        select count(*)::int as orders, coalesce(sum(grand_total),0)::float8 as revenue,
          coalesce(sum(discount),0)::float8 as discounts, coalesce(sum(amount_paid),0)::float8 as collected
        from invoices i where i.status not in ('Draft','Cancelled','Returned') and ${invConds.cond}`,
        invConds.params),
      pool.query(`
        select ${period === "daily" ? "i.invoice_date::text"
          : period === "weekly" ? "to_char(date_trunc('week', i.invoice_date), 'YYYY-MM-DD')"
          : period === "yearly" ? "to_char(date_trunc('year', i.invoice_date), 'YYYY')"
          : "to_char(date_trunc('month', i.invoice_date), 'YYYY-MM')"} as bucket,
          count(*)::int as orders, coalesce(sum(i.grand_total),0)::float8 as revenue
        from invoices i
        where i.status not in ('Draft','Cancelled','Returned') and ${invConds.cond}
        group by 1 order by 1`, invConds.params),
      pool.query(`
        select coalesce(it.name, 'Unknown') as product, coalesce(it.sku, '') as sku,
          sum(it.quantity)::int as qty_sold, coalesce(sum(it.line_total),0)::float8 as revenue,
          coalesce(sum(it.net_weight * it.quantity),0)::float8 as weight_sold
        from invoices i join invoice_items it on it.invoice_id = i.id
        where i.status not in ('Draft','Cancelled','Returned') and ${invConds.cond}
        group by coalesce(it.name, 'Unknown'), coalesce(it.sku, '') order by revenue desc limit ${limit}`, invConds.params),
      pool.query(`
        select i.customer_name as customer, count(*)::int as orders, coalesce(sum(i.grand_total),0)::float8 as revenue
        from invoices i where i.status not in ('Draft','Cancelled','Returned') and ${invConds.cond}
        group by i.customer_name order by revenue desc limit ${limit}`, invConds.params),
      pool.query(`
        select coalesce(px.category, 'Uncategorized') as category, sum(it.quantity)::int as qty_sold,
          coalesce(sum(it.line_total),0)::float8 as revenue
        from invoices i join invoice_items it on it.invoice_id = i.id left join products px on px.id = it.product_id
        where i.status not in ('Draft','Cancelled','Returned') and ${invConds.cond}
        group by coalesce(px.category, 'Uncategorized') order by revenue desc`, invConds.params),
      pool.query(`
        select coalesce(payment_method, 'Not Specified') as method, count(*)::int as orders,
          coalesce(sum(grand_total),0)::float8 as revenue
        from invoices where status not in ('Draft','Cancelled','Returned') and ${baseConds.cond}
        group by coalesce(payment_method, 'Not Specified') order by revenue desc`, baseConds.params),
      pool.query(`
        select source, count(*)::int as orders, coalesce(sum(grand_total),0)::float8 as revenue
        from invoices where status not in ('Draft','Cancelled','Returned') and ${baseConds.cond}
        group by source`, baseConds.params),
      pool.query(`
        select coalesce(sum(grand_total),0)::float8 as value, count(*)::int as count
        from invoices where status = 'Returned'
          ${from ? ` and invoice_date >= $1` : ""} ${to ? ` and invoice_date <= $2` : ""}`,
        [from ? from : null, to ? to : null].filter((v) => v !== null)),
    ]);

    const k = kpisRes.rows[0] || {};
    const orders = Number(k.orders || 0);
    const revenue = Number(k.revenue || 0);
    const returns = returnsRes.rows[0] || {};

    res.json({
      success: true,
      data: {
        kpis: {
          revenue,
          orders,
          aov: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
          discounts: Number(k.discounts || 0),
          collected: Number(k.collected || 0),
          discountRate: revenue ? Math.round((Number(k.discounts || 0) / revenue) * 1000) / 10 : 0,
          returnRate: orders ? Math.round((Number(returns.count || 0) / (orders + Number(returns.count || 0))) * 1000) / 10 : 0,
          returnsValue: Number(returns.value || 0),
        },
        trend: trendRes.rows,
        topProducts: productsRes.rows,
        topCustomers: customersRes.rows,
        categoryPerformance: categoriesRes.rows,
        paymentMethods: paymentsRes.rows,
        sourcePerformance: sourcesRes.rows,
      },
    });
  } catch (error) { next(error); }
});

// ---------- Inventory Report ----------

reportsRouter.get("/api/reports/inventory", authenticate, requirePermission("reports.inventory.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const from = stringParam(req, "from");
    const to = stringParam(req, "to");
    const category = stringParam(req, "category");
    const stockFilter = stringParam(req, "stock");

    const conds: string[] = ["p.status = 'Active'"];
    const params: unknown[] = [];
    if (category) { params.push(category); conds.push(`p.category = $${params.length}`); }
    if (stockFilter === "Out of Stock") conds.push("p.stock_qty = 0");
    else if (stockFilter === "Low Stock") conds.push("p.stock_qty > 0 and p.stock_qty <= p.min_stock_qty");
    else if (stockFilter === "In Stock") conds.push("p.stock_qty > 0");
    const where = ` where ${conds.join(" and ")}`;

    const movementConds: string[] = ["1 = 1"];
    const movementParams: unknown[] = [];
    if (from) { movementParams.push(from); movementConds.push(`sm.created_at::date >= $${movementParams.length}`); }
    if (to) { movementParams.push(to); movementConds.push(`sm.created_at::date <= $${movementParams.length}`); }
    if (category) { movementParams.push(category); movementConds.push(`p.category = $${movementParams.length}`); }
    const movementWhere = movementConds.join(" and ");

    const stockMovementConds: string[] = ["1 = 1"];
    let stockMovementParams: unknown[] = [];
    const mOffset = params.length;
    if (from) { stockMovementParams.push(from); stockMovementConds.push(`sm.created_at::date >= $${mOffset + stockMovementParams.length}`); }
    if (to) { stockMovementParams.push(to); stockMovementConds.push(`sm.created_at::date <= $${mOffset + stockMovementParams.length}`); }
    if (category) { stockMovementParams.push(category); stockMovementConds.push(`p.category = $${mOffset + stockMovementParams.length}`); }
    const stockMovementWhere = stockMovementConds.join(" and ");
    stockMovementParams = params.concat(stockMovementParams);

    const [summaryRes, stockRes, movementsRes, lowStockRes, categoryRes] = await Promise.all([
      pool.query(`
        select count(*)::int as total_products,
          count(*) filter (where p.stock_qty > 0)::int as in_stock,
          count(*) filter (where p.stock_qty > 0 and p.stock_qty <= p.min_stock_qty)::int as low_stock,
          count(*) filter (where p.stock_qty = 0)::int as out_of_stock,
          coalesce(sum(p.stock_qty),0)::int as total_qty,
          coalesce(sum(p.net_weight * p.stock_qty),0)::float8 as total_weight
        from products p${where}`, params),
      pool.query(`
        select p.id, p.sku, p.name, p.category, p.purity, p.net_weight::float8 as net_weight,
          p.making_charge::float8 as making_charge, p.stock_qty as closing, p.min_stock_qty, p.sold_qty,
          (select coalesce(sum(sm.quantity_change),0) from stock_movements sm
            where sm.product_id = p.id and ${stockMovementWhere})::int as net_movement
        from products p${where} order by p.name`, stockMovementParams),
      pool.query(`
        select sm.id, sm.created_at::text as created_at, sm.movement_type, sm.quantity_change,
          sm.resulting_qty, sm.reference, sm.reference_type, sm.notes, sm.product_id,
          p.sku, p.name as product_name
        from stock_movements sm join products p on p.id = sm.product_id
        where ${movementWhere}
        order by sm.created_at desc limit 500`, movementParams),
      pool.query(`
        select p.id, p.sku, p.name, p.category, p.stock_qty, p.min_stock_qty
        from products p where p.status = 'Active' and p.stock_qty > 0 and p.stock_qty <= p.min_stock_qty
        order by p.stock_qty asc`, []),
      pool.query(`
        select p.category, count(*)::int as products, coalesce(sum(p.stock_qty),0)::int as qty,
          coalesce(sum(p.net_weight * p.stock_qty),0)::float8 as weight
        from products p${where}
        group by p.category order by weight desc`, params),
    ]);

    const silverRate = await currentSilverRate();
    const stock = stockRes.rows.map((p: any) => {
      const closing = Number(p.closing);
      const opening = closing - Number(p.net_movement || 0);
      const rows = movementsRes.rows.filter((m: any) => m.product_id === p.id);
      let purchased = 0, sold = 0, returned = 0, adjusted = 0;
      for (const m of rows) {
        const q = Number(m.quantity_change);
        if (m.movement_type === "Purchase Receipt") purchased += q;
        else if (m.movement_type === "Sale") sold += -q;
        else if (m.movement_type === "Purchase Return") returned += -q;
        else adjusted += q;
      }
      return {
        id: p.id, sku: p.sku, name: p.name, category: p.category, purity: p.purity,
        netWeight: Number(p.net_weight), makingCharge: Number(p.making_charge),
        opening, purchased, sold, returned, adjusted, closing,
        minStock: Number(p.min_stock_qty), soldQty: Number(p.sold_qty || 0),
        value: Math.round((Number(p.net_weight) * silverRate + Number(p.making_charge)) * closing * 100) / 100,
      };
    });

    const summary = summaryRes.rows[0] || {};
    const stockValue = stock.reduce((s: number, p: any) => s + p.value, 0);
    const weightValue = stock.reduce((s: number, p: any) => s + Number(p.netWeight) * Number(p.closing), 0);

    res.json({
      success: true,
      data: {
        silverRate,
        summary: {
          totalProducts: Number(summary.total_products || 0),
          inStock: Number(summary.in_stock || 0),
          lowStock: Number(summary.low_stock || 0),
          outOfStock: Number(summary.out_of_stock || 0),
          totalQty: Number(summary.total_qty || 0),
          totalWeight: Number(summary.total_weight || 0),
          totalValue: Math.round(stockValue * 100) / 100,
          weightValue: Math.round(weightValue * 100) / 100,
        },
        stock,
        movements: movementsRes.rows,
        lowStock: lowStockRes.rows,
        categoryStock: categoryRes.rows,
      },
    });
  } catch (error) { next(error); }
});
