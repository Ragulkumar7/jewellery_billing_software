import { Pool } from "pg";
import { env } from "../config/index.js";

export const pool = env.DATABASE_URL
  ? new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 })
  : null;

export async function databaseReady(): Promise<boolean> {
  if (!pool) return false;
  const client = await pool.connect();
  try {
    await client.query("select 1");
    return true;
  } finally {
    client.release();
  }
}
