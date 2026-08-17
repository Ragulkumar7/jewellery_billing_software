import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";

export type AuthenticatedRequest = Request & {
  auth?: { userId: string | null; sessionId: string; permissions: Set<string> };
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token && process.env.NODE_ENV === "development" && process.env.DEV_AUTH_BYPASS === "true") {
    req.auth = { userId: null, sessionId: "development", permissions: new Set(["*"]) };
    return next();
  }
  if (!token || !pool) return res.status(401).json({ success: false, message: "Authentication required" });
  try {
    const { rows } = await pool.query(
      `select s.id session_id, u.id user_id, u.status,
              coalesce(json_agg(p.key) filter (where p.key is not null), '[]') permissions
       from sessions s join users u on u.id = s.user_id
       left join user_roles ur on ur.user_id = u.id
       left join role_permissions rp on rp.role_id = ur.role_id
       left join permissions p on p.id = rp.permission_id
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
       group by s.id, u.id, u.status`, [hashToken(token)],
    );
    const session = rows[0];
    if (!session || session.status !== "Active") return res.status(401).json({ success: false, message: "Session is invalid or inactive" });
    await pool.query("update sessions set last_activity_at = now() where id = $1", [session.session_id]);
    req.auth = { userId: session.user_id, sessionId: session.session_id, permissions: new Set(session.permissions) };
    next();
  } catch (error) { next(error); }
}

export const requirePermission = (permission: string) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.auth?.permissions.has(permission) && !req.auth?.permissions.has("*")) return res.status(403).json({ success: false, message: `Missing permission: ${permission}` });
  next();
};

export { hashToken };
