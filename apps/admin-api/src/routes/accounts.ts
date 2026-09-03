import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission, type AuthenticatedRequest } from "../middleware/authorization.js";

export const accountsRouter: RouterType = Router();

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const actionPastTense: Record<string, string> = { Approve: "Approved", Cancel: "Cancelled", Reject: "Rejected", Pay: "Paid" };
function pastTense(action: string): string {
  return actionPastTense[action] ?? action.toLowerCase() + "ed";
}

// ---------- Summary ----------

accountsRouter.get("/api/accounts/summary", authenticate, requirePermission("accounts.ledger.view"), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const [receivableRes, payableRes, expenseRes, paymentRes] = await Promise.all([
      pool.query(`select coalesce(sum(outstanding_balance),0)::float8 as total from customers where status = 'Active'`),
      pool.query(`select coalesce(sum(outstanding_balance),0)::float8 as total from suppliers where status = 'Active'`),
      pool.query(`select coalesce(sum(case when status in ('Approved','Paid') then amount else 0 end),0)::float8 as total, coalesce(sum(case when status = 'Pending' then amount else 0 end),0)::float8 as pending from expenses`),
      pool.query(`select coalesce(sum(case when direction = 'Incoming' and status = 'Completed' then amount else 0 end),0)::float8 as incoming, coalesce(sum(case when direction = 'Outgoing' and status = 'Completed' then amount else 0 end),0)::float8 as outgoing from payments`),
    ]);
    res.json({
      success: true,
      data: {
        receivable: receivableRes.rows[0].total,
        payable: payableRes.rows[0].total,
        expenseTotal: expenseRes.rows[0].total,
        expensePending: expenseRes.rows[0].pending,
        paymentsIn: paymentRes.rows[0].incoming,
        paymentsOut: paymentRes.rows[0].outgoing,
      },
    });
  } catch (error) { next(error); }
});

// ---------- Expenses ----------

accountsRouter.get("/api/expenses", authenticate, requirePermission("accounts.expense.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const category = req.query.category ? String(req.query.category) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const method = req.query.method ? String(req.query.method) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conditions.push(`e.status = $${params.length}`); }
    if (category) { params.push(category); conditions.push(`e.category = $${params.length}`); }
    if (method) { params.push(method); conditions.push(`e.payment_method = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`e.expense_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`e.expense_date <= $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(e.expense_number ilike $${params.length} or e.description ilike $${params.length} or e.category ilike $${params.length} or e.payment_reference ilike $${params.length} or u.name ilike $${params.length})`);
    }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select e.*, e.amount::float8 as amount,
        u.name as created_by_name, a.name as approved_by_name
      from expenses e
        left join users u on u.id = e.created_by
        left join users a on a.id = e.approved_by${where}
      order by e.expense_date desc, e.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

accountsRouter.get("/api/expenses/:id", authenticate, requirePermission("accounts.expense.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(`
      select e.*, e.amount::float8 as amount,
        u.name as created_by_name, a.name as approved_by_name
      from expenses e
        left join users u on u.id = e.created_by
        left join users a on a.id = e.approved_by
      where e.id = $1`, [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "Expense not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

const expenseSchema = z.object({
  category: z.string().min(1),
  expense_date: z.string().date().optional(),
  amount: z.number().positive(),
  payment_method: z.string().min(1).default("Cash"),
  payment_reference: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  remarks: z.string().max(1000).optional().nullable(),
  receipt_url: z.string().max(500).optional().nullable(),
  status: z.enum(["Pending", "Paid"]).optional(),
});

accountsRouter.post("/api/expenses", authenticate, requirePermission("accounts.expense.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid expense payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const e = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const paid = e.status === "Paid";
    const created = await client.query(
      `insert into expenses (category, expense_date, amount, payment_method, payment_reference, description, remarks, receipt_url, status, payment_date, paid_at, paid_by, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8, $9, $10, $11, $12, $13) returning *`,
      [e.category, e.expense_date ?? new Date().toISOString().slice(0, 10), e.amount, e.payment_method, e.payment_reference ?? null, e.description ?? null, e.remarks ?? null, e.receipt_url ?? null, paid ? "Paid" : "Pending", paid ? (e.expense_date ?? new Date().toISOString().slice(0, 10)) : null, paid ? req.auth?.userId ?? null : null, paid ? req.auth?.userId ?? null : null, req.auth?.userId ?? null],
    );
    const expense = created.rows[0];
    if (paid) {
      await client.query(
        "insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, status, notes, payment_date, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), 'Outgoing', 'Expense Payment', $1, NULL, $2, $3, $4, 'Completed', $5, $6, $7) returning *",
        [e.category, expense.expense_number, e.amount, e.payment_method, e.description ?? null, e.expense_date ?? new Date().toISOString().slice(0, 10), req.auth?.userId ?? null],
      );
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Accounts', $2, $3, 'Expense', $4, $5)", [req.auth?.userId ?? null, paid ? "Created Expense — Paid" : "Created Expense", expense.id, JSON.stringify({ expenseNumber: expense.expense_number, category: e.category, amount: e.amount, status: expense.status }), `Expense ${expense.expense_number} created — ₹${e.amount}${paid ? " (paid)" : ""}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

accountsRouter.put("/api/expenses/:id", authenticate, requirePermission("accounts.expense.edit"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = expenseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid expense payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const e = parsed.data;
  const sets: string[] = [];
  const values: unknown[] = [];
  const fields: (keyof typeof e)[] = ["category", "expense_date", "amount", "payment_method", "payment_reference", "description", "remarks", "receipt_url"];
  for (const f of fields) {
    if (e[f] !== undefined) {
      values.push(e[f] === null ? null : e[f]);
      sets.push(`${f} = $${values.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ success: false, message: "No expense fields supplied" });
  sets.push("updated_at = now()");
  values.push(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(`update expenses set ${sets.join(", ")} where id = $${values.length} returning *`, values);
    if (!rows[0]) throw new Error("Expense not found");
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value) values ($1, 'Accounts', 'Edited Expense', $2, 'Expense', $3)", [req.auth?.userId ?? null, rows[0].id, JSON.stringify({ expenseNumber: rows[0].expense_number, ...e })]);
    await client.query("commit");
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

const expenseStatusSchema = z.object({ action: z.enum(["Approve", "Cancel"]), reason: z.string().max(1000).optional().nullable() });

accountsRouter.post("/api/expenses/:id/status", authenticate, requirePermission("accounts.expense.view"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = expenseStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid expense action", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { action, reason } = parsed.data;
  const perm = action === "Approve" ? "accounts.expense.approve" : "accounts.expense.edit";
  if (!(req.auth?.permissions.has("*") || req.auth?.permissions.has(perm))) return res.status(403).json({ success: false, message: `Missing permission: ${perm}` });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const expenseResult = await client.query("select * from expenses where id = $1 for update", [req.params.id]);
    const expense = expenseResult.rows[0];
    if (!expense) throw new Error("Expense not found");
    if (expense.status === "Cancelled") throw new Error("Cancelled expenses cannot be modified");
    if (action === "Approve") {
      if (!["Pending", "Approved"].includes(expense.status)) throw new Error(`Only pending expenses can be approved (current: ${expense.status})`);
      await client.query("update expenses set status = 'Approved', approved_at = now(), approved_by = $2, updated_at = now() where id = $1", [expense.id, req.auth?.userId ?? null]);
    } else {
      if (expense.status === "Paid") throw new Error("Paid expenses cannot be cancelled");
      await client.query("update expenses set status = 'Cancelled', updated_at = now() where id = $1", [expense.id]);
    }
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Accounts', $2, $3, 'Expense', $4, $5)", [req.auth?.userId ?? null, `${pastTense(action)} Expense`, expense.id, JSON.stringify({ expenseNumber: expense.expense_number, toStatus: action === "Approve" ? "Approved" : "Cancelled" }), `Expense ${expense.expense_number} ${pastTense(action).toLowerCase()}${reason ? ` — ${reason}` : ""}`]);
    await client.query("commit");
    const { rows } = await pool.query("select * from expenses where id = $1", [expense.id]);
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Record a payment against an expense — marks it Paid and posts an outgoing payment.
accountsRouter.post("/api/expenses/:id/payment", authenticate, requirePermission("accounts.payment.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ amount: z.number().positive().optional(), method: z.string().min(1).default("Cash"), reference: z.string().max(100).optional().nullable(), payment_date: z.string().date().optional(), notes: z.string().max(500).optional().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid payment payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const { amount, method, reference, payment_date, notes } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const expenseResult = await client.query("select * from expenses where id = $1 for update", [req.params.id]);
    const expense = expenseResult.rows[0];
    if (!expense) throw new Error("Expense not found");
    if (expense.status === "Paid") throw new Error("Expense is already paid");
    if (expense.status === "Cancelled") throw new Error("Cancelled expenses cannot be paid");
    const payAmount = amount ?? Number(expense.amount);
    const paymentResult = await client.query(
      "insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, status, notes, payment_date, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), 'Outgoing', 'Expense Payment', $1, NULL, $2, $3, $4, 'Completed', $5, $6, $7) returning *",
      [expense.category, expense.expense_number, payAmount, method, notes ?? null, payment_date ?? new Date().toISOString().slice(0, 10), req.auth?.userId ?? null],
    );
    await client.query("update expenses set status = 'Paid', payment_reference = coalesce($2, payment_reference), payment_date = $3, paid_at = now(), paid_by = $4, updated_at = now() where id = $1", [expense.id, reference ?? null, payment_date ?? new Date().toISOString().slice(0, 10), req.auth?.userId ?? null]);
    await client.query("insert into ledger_entries (transaction_type, reference, debit, credit, description, created_by) values ('Expense', $1, $2, 0, $3, $4)", [expense.expense_number, payAmount, `Expense ${expense.expense_number} (${expense.category}) paid` + (notes ? ` — ${notes}` : ""), req.auth?.userId ?? null]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Accounts', 'Paid Expense', $2, 'Expense', $3, $4)", [req.auth?.userId ?? null, expense.id, JSON.stringify({ expenseNumber: expense.expense_number, amount: payAmount, method }), `₹${payAmount} paid on expense ${expense.expense_number} via ${method}`]);
    await client.query("commit");
    res.json({ success: true, data: { payment: paymentResult.rows[0] } });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// ---------- Payments ----------

accountsRouter.get("/api/payments", authenticate, requirePermission("accounts.payment.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const direction = req.query.direction ? String(req.query.direction) : null;
    const type = req.query.type ? String(req.query.type) : null;
    const method = req.query.method ? String(req.query.method) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (direction) { params.push(direction); conditions.push(`p.direction = $${params.length}`); }
    if (type) { params.push(type); conditions.push(`p.payment_type = $${params.length}`); }
    if (method) { params.push(method); conditions.push(`p.payment_method = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`p.payment_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`p.payment_date <= $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(p.payment_number ilike $${params.length} or p.party_name ilike $${params.length} or p.reference ilike $${params.length} or p.notes ilike $${params.length})`);
    }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select p.*, p.amount::float8 as amount, p.payment_date::text as payment_date, u.name as created_by_name
      from payments p left join users u on u.id = p.created_by${where}
      order by p.payment_date desc, p.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

const paymentSchema = z.object({
  direction: z.enum(["Incoming", "Outgoing"]),
  payment_type: z.string().min(1),
  party_name: z.string().max(200).optional().nullable(),
  party_id: z.string().uuid().optional().nullable(),
  reference: z.string().max(100).optional().nullable(),
  amount: z.number().positive(),
  payment_method: z.string().min(1).default("Cash"),
  payment_date: z.string().date().optional(),
  notes: z.string().max(500).optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  piId: z.string().uuid().optional().nullable(),
  expenseId: z.string().uuid().optional().nullable(),
});

accountsRouter.get("/api/payments/:id", authenticate, requirePermission("accounts.payment.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(
      `select p.*, p.amount::float8 as amount, p.payment_date::text as payment_date, u.name as created_by_name
       from payments p left join users u on u.id = p.created_by where p.id = $1`, [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "Payment not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});

// Receive / make a payment. Optional settlement: incoming payments may reference a sales
// invoice (invoiceId), outgoing supplier payments a purchase invoice (piId), and expense
// payments an expense (expenseId).
accountsRouter.post("/api/payments", authenticate, requirePermission("accounts.payment.create"), async (req: AuthenticatedRequest, res, next) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid payment payload", issues: parsed.error.issues });
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const p = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("begin");
    let partyName = p.party_name ?? null;
    let partyId = p.party_id ?? null;
    let reference = p.reference ?? null;
    let txLabel = p.payment_type;
    let invoiceRef: string | null = null;

    if (p.invoiceId) {
      const invRes = await client.query("select * from invoices where id = $1 for update", [p.invoiceId]);
      const inv = invRes.rows[0];
      if (!inv) throw new Error("Sales invoice not found");
      if (["Cancelled", "Returned", "Draft"].includes(inv.status)) throw new Error(`Payments cannot be recorded on ${inv.status} invoices`);
      if (p.amount > Number(inv.outstanding_balance) + 0.001) throw new Error(`Payment exceeds the outstanding balance of ${inv.outstanding_balance}`);
      const newPaid = round2(Number(inv.amount_paid) + p.amount);
      const newOutstanding = round2(Number(inv.grand_total) - newPaid);
      const newStatus = newOutstanding <= 0 ? "Paid" : "Partially Paid";
      await client.query("update invoices set amount_paid = $2, outstanding_balance = $3, payment_status = $4, updated_at = now() where id = $1", [inv.id, newPaid, newOutstanding, newStatus]);
      if (inv.customer_id) await client.query("update customers set outstanding_balance = greatest(0, outstanding_balance - $1) where id = $2", [p.amount, inv.customer_id]);
      partyName = inv.customer_name;
      partyId = inv.customer_id ?? null;
      reference = inv.invoice_number;
      invoiceRef = inv.invoice_number;
      txLabel = p.payment_type === "Invoice Payment" ? "Invoice Payment" : "Customer Payment";
    }

    if (p.piId) {
      const piRes = await client.query("select * from purchase_invoices where id = $1 for update", [p.piId]);
      const pi = piRes.rows[0];
      if (!pi) throw new Error("Purchase invoice not found");
      if (!["Approved", "Partially Paid", "Paid"].includes(pi.status)) throw new Error(`Payments can only be recorded on approved invoices (current: ${pi.status})`);
      if (p.amount > Number(pi.outstanding_balance) + 0.001) throw new Error(`Payment exceeds the outstanding balance of ${pi.outstanding_balance}`);
      const newPaid = round2(Number(pi.amount_paid) + p.amount);
      const newOutstanding = round2(Number(pi.grand_total) - newPaid);
      const newPaymentStatus = newOutstanding <= 0 ? "Paid" : "Partially Paid";
      await client.query("update purchase_invoices set amount_paid = $2, outstanding_balance = $3, payment_status = $4, status = $4, updated_at = now() where id = $1", [pi.id, newPaid, newOutstanding, newPaymentStatus]);
      await client.query("update suppliers set outstanding_balance = greatest(0, outstanding_balance - $1) where id = $2", [p.amount, pi.supplier_id]);
      const supplierRes = await client.query("select name from suppliers where id = $1", [pi.supplier_id]);
      partyName = supplierRes.rows[0]?.name ?? partyName;
      partyId = pi.supplier_id ?? null;
      reference = pi.pi_number;
      txLabel = "Supplier Payment";
    }

    if (p.expenseId) {
      const expRes = await client.query("select * from expenses where id = $1 for update", [p.expenseId]);
      const exp = expRes.rows[0];
      if (!exp) throw new Error("Expense not found");
      if (exp.status === "Paid") throw new Error("Expense is already paid");
      if (exp.status === "Cancelled") throw new Error("Cancelled expenses cannot be paid");
      await client.query("update expenses set status = 'Paid', payment_reference = coalesce($2, payment_reference), payment_date = $3, paid_at = now(), paid_by = $4, updated_at = now() where id = $1", [exp.id, p.reference ?? null, p.payment_date ?? new Date().toISOString().slice(0, 10), req.auth?.userId ?? null]);
      partyName = exp.category;
      reference = exp.expense_number;
      txLabel = "Expense Payment";
    }

    const paymentResult = await client.query(
      "insert into payments (payment_number, direction, payment_type, party_name, party_id, reference, amount, payment_method, status, notes, payment_date, created_by) values ('PAY-' || to_char(current_date, 'YYYY') || '-' || nextval('payment_number_seq'), $1, $2, $3, $4, $5, $6, $7, 'Completed', $8, $9, $10) returning *",
      [p.direction, txLabel, partyName, partyId, reference, p.amount, p.payment_method, p.notes ?? null, p.payment_date ?? new Date().toISOString().slice(0, 10), req.auth?.userId ?? null],
    );
    const description = p.direction === "Incoming"
      ? `Payment received${invoiceRef ? ` on ${invoiceRef}` : p.notes ? "" : ""}${p.notes ? ` — ${p.notes}` : ""}`
      : `Payment made${reference ? ` on ${reference}` : ""}${p.notes ? ` — ${p.notes}` : ""}`;
    await client.query("insert into ledger_entries (transaction_type, reference, debit, credit, description, created_by) values ($1, $2, $3, $4, $5, $6)",
      [txLabel, reference, p.direction === "Outgoing" ? p.amount : 0, p.direction === "Incoming" ? p.amount : 0, description, req.auth?.userId ?? null],
    );
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Accounts', $2, $3, 'Payment', $4, $5)", [req.auth?.userId ?? null, p.direction === "Incoming" ? "Received Payment" : "Made Payment", paymentResult.rows[0].id, JSON.stringify({ paymentNumber: paymentResult.rows[0].payment_number, direction: p.direction, type: txLabel, amount: p.amount, method: p.payment_method }), `${p.direction === "Incoming" ? "Received" : "Paid"} ₹${p.amount}${reference ? ` on ${reference}` : ""} via ${p.payment_method}`]);
    await client.query("commit");
    res.status(201).json({ success: true, data: paymentResult.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// Cancel / void a payment, reversing any settlement applied to invoices.
accountsRouter.post("/api/payments/:id/cancel", authenticate, requirePermission("accounts.payment.cancel"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const payRes = await client.query("select * from payments where id = $1 for update", [req.params.id]);
    const payment = payRes.rows[0];
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "Cancelled") throw new Error("Payment is already cancelled");
    const amount = Number(payment.amount);

    if (payment.reference) {
      if (payment.direction === "Incoming") {
        const invRes = await client.query("select * from invoices where invoice_number = $1 for update", [payment.reference]);
        const inv = invRes.rows[0];
        if (inv && !["Cancelled", "Returned"].includes(inv.status)) {
          const newPaid = round2(Math.max(0, Number(inv.amount_paid) - amount));
          const newOutstanding = round2(Number(inv.grand_total) - newPaid);
          const newStatus = newOutstanding <= 0 ? "Paid" : newPaid > 0 ? "Partially Paid" : "Unpaid";
          await client.query("update invoices set amount_paid = $2, outstanding_balance = $3, payment_status = $4, updated_at = now() where id = $1", [inv.id, newPaid, newOutstanding, newStatus]);
          if (inv.customer_id) await client.query("update customers set outstanding_balance = outstanding_balance + $1 where id = $2", [amount, inv.customer_id]);
        }
      } else if (payment.direction === "Outgoing") {
        const piRes = await client.query("select * from purchase_invoices where pi_number = $1 for update", [payment.reference]);
        const pi = piRes.rows[0];
        if (pi && !["Cancelled", "Draft"].includes(pi.status)) {
          const newPaid = round2(Math.max(0, Number(pi.amount_paid) - amount));
          const newOutstanding = round2(Number(pi.grand_total) - newPaid);
          const newPaymentStatus = newOutstanding <= 0 ? "Paid" : newPaid > 0 ? "Partially Paid" : "Unpaid";
          await client.query("update purchase_invoices set amount_paid = $2, outstanding_balance = $3, payment_status = $4, status = $4, updated_at = now() where id = $1", [pi.id, newPaid, newOutstanding, newPaymentStatus]);
          await client.query("update suppliers set outstanding_balance = outstanding_balance + $1 where id = $2", [amount, pi.supplier_id]);
        }
      }
    }

    await client.query("update payments set status = 'Cancelled', notes = coalesce($2, notes || ' — Cancelled') where id = $1", [payment.id, null]);
    await client.query("insert into activity_logs (user_id, module, action, record_id, record_type, new_value, remarks) values ($1, 'Accounts', 'Cancelled Payment', $2, 'Payment', $3, $4)", [req.auth?.userId ?? null, payment.id, JSON.stringify({ paymentNumber: payment.payment_number, amount }), `Payment ${payment.payment_number} of ₹${amount} cancelled`]);
    await client.query("commit");
    const { rows } = await pool.query("select * from payments where id = $1", [payment.id]);
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

// ---------- Purchase System (financial view, accounts.purchase.view) ----------

accountsRouter.get("/api/accounts/purchase-system", authenticate, requirePermission("accounts.purchase.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const payment = req.query.payment ? String(req.query.payment) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (payment) { params.push(payment); conditions.push(`i.payment_status = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`i.pi_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`i.pi_date <= $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(i.pi_number ilike $${params.length} or i.supplier_invoice_number ilike $${params.length} or s.name ilike $${params.length})`);
    }
    params.push(limit);
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(`
      select i.id, i.pi_number, i.supplier_invoice_number, i.supplier_id, i.pi_date, i.due_date, i.status, i.payment_status,
        i.subtotal::float8 as subtotal, i.gst_amount::float8 as gst_amount, i.round_off::float8 as round_off,
        i.grand_total::float8 as grand_total, i.amount_paid::float8 as amount_paid, i.outstanding_balance::float8 as outstanding_balance,
        i.notes, i.created_at, s.name as supplier_name
      from purchase_invoices i left join suppliers s on s.id = i.supplier_id${where}
      order by i.pi_date desc, i.created_at desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

accountsRouter.get("/api/accounts/purchase-system/:id", authenticate, requirePermission("accounts.purchase.view"), async (req, res, next) => {
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
    const paymentsResult = await pool.query("select p.*, p.amount::float8 as amount from payments p where p.reference = $1 and p.status = 'Completed' order by p.created_at", [invoice.pi_number]);
    res.json({ success: true, data: { invoice, items: itemsResult.rows, payments: paymentsResult.rows } });
  } catch (error) { next(error); }
});

// ---------- Ledger ----------

accountsRouter.get("/api/accounts/ledger", authenticate, requirePermission("accounts.ledger.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const type = req.query.type ? String(req.query.type) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.min(300, Math.max(1, Number(req.query.limit || 100)));
    const conditions: string[] = [];
    const params: unknown[] = [];

    const withClause = `
      with combined as (
        select i.id as source_id, 'Sales Invoice' as tx_type, i.invoice_number as tx_number, i.invoice_date as entry_date,
          i.customer_name as party, i.invoice_number as reference, i.grand_total::float8 as debit, 0::float8 as credit,
          'Sale to ' || i.customer_name as description, i.created_at as created_at
        from invoices i where i.status in ('Paid', 'Partially Paid', 'Unpaid')
        union all
        select p.id, p.payment_type, p.payment_number, p.payment_date, p.party_name, p.reference,
          case when p.direction = 'Outgoing' then p.amount::float8 else 0 end,
          case when p.direction = 'Incoming' then p.amount::float8 else 0 end,
          p.notes, p.created_at
        from payments p where p.status = 'Completed' and p.payment_type != 'Expense Payment'
        union all
        select i.id, 'Purchase Invoice', i.pi_number, i.pi_date, s.name, i.pi_number, i.grand_total::float8, 0,
          'Purchase from ' || coalesce(s.name, 'Supplier'), i.created_at
        from purchase_invoices i left join suppliers s on s.id = i.supplier_id where i.status in ('Approved', 'Partially Paid', 'Paid')
        union all
        select e.id, 'Expense', e.expense_number, e.expense_date, e.category, e.payment_reference, e.amount::float8, 0,
          coalesce(e.description, e.category), e.created_at
        from expenses e where e.status in ('Approved', 'Paid')
        union all
        select r.id, 'Purchase Return', r.return_number, r.return_date, s.name, r.return_number, 0, r.grand_total::float8,
          'Purchase return from ' || coalesce(s.name, 'Supplier'), r.created_at
        from purchase_returns r left join suppliers s on s.id = r.supplier_id where r.status = 'Approved'
        union all
        select r.id, 'Sales Return', r.return_number, r.return_date, r.customer_name, r.return_number, r.grand_total::float8, 0,
          'Sales return for ' || coalesce(r.customer_name, 'Customer'), r.created_at
        from sales_returns r where r.status = 'Processed'
      )
      select *, row_number() over () as rn from combined
    `;

    if (type) { params.push(type); conditions.push(`tx_type = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`entry_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`entry_date <= $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(tx_number ilike $${params.length} or party ilike $${params.length} or reference ilike $${params.length} or description ilike $${params.length})`);
    }
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    params.push(limit);

    const { rows } = await pool.query(`
      select source_id, tx_type, tx_number, entry_date::text as entry_date, party, reference, description,
        debit::float8 as debit, credit::float8 as credit, created_at,
        sum(credit - debit) over (order by entry_date, created_at, source_id rows between unbounded preceding and current row)::float8 as balance
      from (${withClause}) c${where}
      order by entry_date desc, created_at desc, source_id desc limit $${params.length}`, params,
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
