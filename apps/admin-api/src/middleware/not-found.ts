import type { Request, Response } from "express";
import type { ApiError } from "@repo/types/api";

export function notFoundHandler(_req: Request, res: Response): void {
  const response: ApiError = {
    success: false,
    message: "Route not found",
    code: "NOT_FOUND",
  };

  res.status(404).json(response);
}
