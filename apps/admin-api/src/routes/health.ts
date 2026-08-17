import { Router, type Router as RouterType } from "express";
import type { ApiResponse } from "@repo/types/api";
import { databaseReady } from "../db/pool.js";

export const healthRouter: RouterType = Router();

healthRouter.get("/health", async (_req, res) => {
  const database = await databaseReady().catch(() => false);
  const response: ApiResponse<{ status: string }> = {
    success: true,
    data: { status: database ? "ok" : "degraded" },
  };

  res.json(response);
});
