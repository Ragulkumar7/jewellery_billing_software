import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authenticate, requirePermission, type AuthenticatedRequest } from "../middleware/authorization.js";

export const settingsRouter: RouterType = Router();

const settingValueSchema = z.object({
  value: z.unknown(),
});

settingsRouter.get("/api/settings", authenticate, requirePermission("system.settings.view"), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  try {
    const { rows } = await pool.query(
      "select id, setting_key, setting_group, setting_value, description, updated_at from settings order by setting_group, setting_key",
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

settingsRouter.put("/api/settings", authenticate, requirePermission("system.settings.edit"), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: "DATABASE_URL is not configured" });
  const parsed = z.record(z.string(), settingValueSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid settings payload", issues: parsed.error.issues });
  const entries = Object.entries(parsed.data);
  if (!entries.length) return res.status(400).json({ success: false, message: "No settings supplied" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated: { setting_key: string; setting_value: unknown; updated_at: string }[] = [];
    for (const [key, { value }] of entries) {
      const { rows } = await client.query(
        "update settings set setting_value = $1, updated_by = $2, updated_at = now() where setting_key = $3 returning setting_key, setting_value, updated_at",
        [JSON.stringify({ value }), req.auth?.userId ?? null, key],
      );
      if (rows[0]) updated.push(rows[0]);
    }
    if (updated.length) {
      await client.query(
        "insert into activity_logs (user_id, module, action, record_type, new_value, remarks) values ($1, 'System', 'Updated settings', 'Settings', $2, $3)",
        [req.auth?.userId ?? null, JSON.stringify(updated.map((u) => ({ key: u.setting_key, value: u.setting_value }))), `Updated ${updated.length} setting(s)`],
      );
    }
    await client.query("commit");
    res.json({ success: true, data: updated });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});