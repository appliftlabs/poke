/** Create/upgrade the schema, then exit. Run: npm run migrate */
import { ensureSchema, pool } from "./db.js";

try {
  await ensureSchema();
  console.log("[poke-server] schema is up to date.");
} catch (err) {
  console.error("[poke-server] migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
