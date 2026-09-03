import { env } from "@repo/config/env";
import { logger } from "@repo/utils/logger";
import { app } from "./app.js";
import { pool } from "./db/pool.js";
import type { Server } from "node:http";

const port = Number(process.env.PORT) || 4000;

const server: Server = app.listen(port, () => {
  logger.info({ port, env: env.NODE_ENV }, "Admin API listening");
});

function shutdown(signal: string) {
  logger.info({ signal }, "Received signal, shutting down gracefully");
  server.close(async () => {
    if (pool) await pool.end().catch(() => {});
    logger.info("Server closed");
    process.exit(0);
  });
  // Force exit after 15 s (Railway SIGTERM grace period)
  setTimeout(() => process.exit(1), 15_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
