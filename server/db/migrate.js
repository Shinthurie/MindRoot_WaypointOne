/* Applies db/migrations/*.sql in name order, once each. */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool, q, waitForDb } from "../src/db.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate() {
  await waitForDb();
  await q("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await q("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    await q(readFileSync(join(dir, f), "utf8"));
    await q("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    console.log(`migrated ${f}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
