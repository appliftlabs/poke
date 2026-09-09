/**
 * Postgres connection pool + the schema.
 *
 * Configure with DATABASE_URL, e.g.
 *   postgres://user:pass@localhost:5432/poke
 */
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[poke-server] DATABASE_URL is required.");
  process.exit(1);
}

/**
 * SSL decision:
 *   PGSSL=1        force on
 *   PGSSL=0        force off
 *   (unset)        off for localhost AND for Railway/Fly internal hostnames
 *                  (private-network connections there are plain TCP), on for
 *                  everything else (managed Postgres over the public internet).
 */
function resolveSsl(conn) {
  if (process.env.PGSSL === "1") return { rejectUnauthorized: false };
  if (process.env.PGSSL === "0") return false;
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\]|::1)[:/]/.test(conn);
  const isPrivate = /@[^/@]*\.(railway\.internal|internal|flycast)[:/]/.test(conn);
  return isLocal || isPrivate ? false : { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString,
  ssl: resolveSsl(connectionString),
  // Give each connection attempt a bounded timeout so a network blip surfaces
  // as a retryable error rather than hanging.
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[poke-server] idle pg client error:", err.message);
});

/** DDL — safe to run repeatedly. Called on boot and by `npm run migrate`. */
export const SCHEMA = /* sql */ `
  CREATE TABLE IF NOT EXISTS poke_threads (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL DEFAULT 'default',
    page_id     TEXT NOT NULL,
    anchor      JSONB NOT NULL,
    status      TEXT  NOT NULL DEFAULT 'open',
    author      JSONB NOT NULL,
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS poke_threads_page
    ON poke_threads (project_id, page_id, created_at);

  CREATE TABLE IF NOT EXISTS poke_messages (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL REFERENCES poke_threads(id) ON DELETE CASCADE,
    author      JSONB NOT NULL,
    body        TEXT  NOT NULL,
    created_at  BIGINT NOT NULL,
    edited_at   BIGINT
  );
  CREATE INDEX IF NOT EXISTS poke_messages_thread
    ON poke_messages (thread_id, created_at);
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run the schema DDL, retrying the first connection.
 *
 * On some hosts (Railway private networking, in particular) the database's
 * internal DNS / network isn't reachable for the first second or two after the
 * container starts. Without this the process would crash-loop on boot.
 */
export async function ensureSchema({ retries = 10, delayMs = 1500 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(SCHEMA);
      if (attempt > 1) {
        console.log(`[poke-server] database reachable after ${attempt} attempts`);
      }
      return;
    } catch (err) {
      lastErr = err;
      const transient =
        err.code === "ECONNREFUSED" ||
        err.code === "ENOTFOUND" ||
        err.code === "EAI_AGAIN" ||
        err.code === "ETIMEDOUT" ||
        err.code === "57P03"; // cannot_connect_now / starting up
      if (!transient || attempt === retries) break;
      console.log(
        `[poke-server] database not ready (${err.code}), retry ${attempt}/${retries} in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

/** Shape a thread row (+ its messages) into the JSON the client expects. */
export function hydrateThread(row, messages) {
  return {
    id: row.id,
    pageId: row.page_id,
    anchor: row.anchor,
    status: row.status,
    author: row.author,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    messages: messages.map(hydrateMessage),
  };
}

export function hydrateMessage(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: row.author,
    body: row.body,
    createdAt: Number(row.created_at),
    ...(row.edited_at != null ? { editedAt: Number(row.edited_at) } : {}),
  };
}
