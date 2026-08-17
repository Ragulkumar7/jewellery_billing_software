import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "./pool.js";

if (!pool) throw new Error("DATABASE_URL is required to run migrations");

const directory = process.env.MIGRATIONS_DIR || resolve(process.cwd(), "../../infra/postgres/migrations");
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
const client = await pool.connect();

try {
  await client.query("create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())");
  for (const filename of files) {
    const applied = await client.query("select 1 from schema_migrations where filename = $1", [filename]);
    if (applied.rowCount) continue;
    await client.query("begin");
    await client.query(await readFile(resolve(directory, filename), "utf8"));
    await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
    await client.query("commit");
    console.log(`Applied ${filename}`);
  }
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
