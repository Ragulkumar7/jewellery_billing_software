import { Router, type Router as RouterType } from "express";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission } from "../middleware/authorization.js";

export const auditRouter: RouterType = Router();

const listQuery = `
  from activity_logs a
  left join users u on u.id = a.user_id
  where ($1 = '' or concat_ws(' ', coalesce(u.name, 'System'), a.module, a.action, a.record_id, a.remarks) ilike '%' || $1 || '%')
    and ($2 = '' or a.module = $2)
    and ($3 = '' or a.action = $3)
    and ($4 = '' or coalesce(u.name, 'System') ilike '%' || $4 || '%')
    and ($5 = '' or a.status = $5)
    and ($6 = '' or a.record_id::text = $6)
    and ($7 = '' or a.created_at >= $7::date)
    and ($8 = '' or a.created_at < ($8::date + interval '1 day'))`;

function params(query: Record<string, unknown>) {
  return [String(query.search || ''), String(query.module || ''), String(query.action || ''), String(query.user || ''), String(query.status || ''), String(query.recordId || ''), String(query.from || ''), String(query.to || '')];
}

auditRouter.get("/api/activity-logs", authenticate, requirePermission("system.activity_logs.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
    const values = params(req.query as Record<string, unknown>);
    const [{ rows }, count] = await Promise.all([
      pool.query(`select a.id, coalesce(u.name, 'System') user_name, a.module, a.action, a.record_id, a.record_type, a.status, a.previous_value, a.new_value, a.remarks, a.ip_address, a.device_info, a.created_at ${listQuery} order by a.created_at desc limit ${limit} offset ${(page - 1) * limit}`, values),
      pool.query(`select count(*)::int total ${listQuery}`, values),
    ]);
    res.json({ success: true, data: { items: rows, total: count.rows[0].total, page, limit } });
  } catch (error) { next(error); }
});

auditRouter.get("/api/activity-logs/:id", authenticate, requirePermission("system.activity_logs.view"), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query("select a.id, coalesce(u.name, 'System') user_name, a.module, a.action, a.record_id, a.record_type, a.status, a.previous_value, a.new_value, a.remarks, a.ip_address, a.device_info, a.created_at from activity_logs a left join users u on u.id = a.user_id where a.id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: "Activity not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
});
