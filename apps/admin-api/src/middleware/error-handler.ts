import type { NextFunction, Request, Response } from "express";
import type { ApiError } from "@repo/types/api";
import { logger } from "@repo/utils/logger";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err }, "Unhandled error");

  const response: ApiError = {
    success: false,
    message: err.message || "Internal server error",
    code: "INTERNAL_ERROR",
  };

  res.status(500).json(response);
}
