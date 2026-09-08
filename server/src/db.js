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

export const pool = new Pool({
  connectionString,
  // Most managed Postgres (Railway, Fly, Render, Supabase, Neon) needs SSL.
  // Local dev usually doesn't. Toggle with PGSSL=1 / PGSSL=0, default: on unless
  // the host is localhost.
  ssl:
    process.env.PGSSL === "0"
      ? false
      : process.env.PGSSL === "1" ||
          !/@(localhost|127\.0\.0\.1|::1)[:/]/.test(connectionString)
        ? { rejectUnauthorized: false }
        : false,
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

export async function ensureSchema() {
  await pool.query(SCHEMA);
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
