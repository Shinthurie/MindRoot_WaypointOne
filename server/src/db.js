import pg from "pg";
import { config } from "./config.js";

// NUMERIC columns come back as numbers (capacities, minutes, kilometres), not strings.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// DATE columns stay plain "YYYY-MM-DD" strings (no time zone shifts).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/* Wait for the database (docker compose starts it at the same time as the API). */
export async function waitForDb(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { await pool.query("SELECT 1"); return; } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
