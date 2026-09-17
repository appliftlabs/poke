/**
 * Schema + queries for the built-in Postgres backend. Same shape as the
 * standalone `server/` package (kept for people who want an isolated deploy) —
 * this is the version that runs inside your own app's routes.
 */
import type { PokeMessage, PokeThread, PokeUser, ThreadStatus } from "../core/types.js";
import type { ElementAnchor } from "../anchor/index.js";
import type { PokeDatabase } from "./types.js";

export const SCHEMA_SQL = /* sql */ `
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Error codes worth retrying — a DB that isn't reachable *yet*, not a real failure. */
const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "57P03", // cannot_connect_now
]);

/**
 * Create the schema if it doesn't exist. Safe to call on every boot. Retries a
 * transient connection failure — some hosts' private networking isn't reachable
 * for the first second or two after the process starts.
 */
export async function ensureSchema(
  db: PokeDatabase,
  { retries = 10, delayMs = 1500 }: { retries?: number; delayMs?: number } = {},
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await db.query(SCHEMA_SQL);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string })?.code;
      if (!code || !TRANSIENT_CODES.has(code) || attempt === retries) break;
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

interface ThreadRow {
  id: string;
  page_id: string;
  anchor: ElementAnchor;
  status: ThreadStatus;
  author: PokeUser;
  created_at: string | number;
  updated_at: string | number;
}

interface MessageRow {
  id: string;
  thread_id: string;
  author: PokeUser;
  body: string;
  created_at: string | number;
  edited_at: string | number | null;
}

function hydrateMessage(row: MessageRow): PokeMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: row.author,
    body: row.body,
    createdAt: Number(row.created_at),
    ...(row.edited_at != null ? { editedAt: Number(row.edited_at) } : {}),
  };
}

function hydrateThread(row: ThreadRow, messages: MessageRow[]): PokeThread {
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

async function messagesForThreads(
  db: PokeDatabase,
  threadIds: string[],
): Promise<Map<string, MessageRow[]>> {
  const byThread = new Map<string, MessageRow[]>(threadIds.map((id) => [id, []]));
  if (threadIds.length === 0) return byThread;
  const { rows } = await db.query<MessageRow>(
    `SELECT * FROM poke_messages WHERE thread_id = ANY($1) ORDER BY created_at ASC`,
    [threadIds],
  );
  for (const m of rows) byThread.get(m.thread_id)?.push(m);
  return byThread;
}

/** `pageId: null` lists every thread in the project namespace. */
export async function listThreads(
  db: PokeDatabase,
  project: string,
  pageId: string | null,
): Promise<PokeThread[]> {
  const { rows } = await db.query<ThreadRow>(
    pageId === null
      ? `SELECT * FROM poke_threads WHERE project_id = $1 ORDER BY created_at ASC`
      : `SELECT * FROM poke_threads WHERE project_id = $1 AND page_id = $2 ORDER BY created_at ASC`,
    pageId === null ? [project] : [project, pageId],
  );
  if (rows.length === 0) return [];
  const byThread = await messagesForThreads(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => hydrateThread(r, byThread.get(r.id) ?? []));
}

export async function getThreadRow(
  db: PokeDatabase,
  project: string,
  id: string,
): Promise<ThreadRow | null> {
  const { rows } = await db.query<ThreadRow>(
    `SELECT * FROM poke_threads WHERE id = $1 AND project_id = $2`,
    [id, project],
  );
  return rows[0] ?? null;
}

export async function createThread(
  db: PokeDatabase,
  project: string,
  thread: PokeThread,
): Promise<PokeThread> {
  const run = async (client: PokeDatabase) => {
    await client.query(
      `INSERT INTO poke_threads
         (id, project_id, page_id, anchor, status, author, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        thread.id,
        project,
        thread.pageId,
        thread.anchor,
        thread.status,
        thread.author,
        thread.createdAt,
        thread.updatedAt,
      ],
    );
    for (const m of thread.messages) {
      await client.query(
        `INSERT INTO poke_messages (id, thread_id, author, body, created_at, edited_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [m.id, thread.id, m.author, m.body, m.createdAt, m.editedAt ?? null],
      );
    }
  };

  if (db.connect) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await run(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } else {
    await run(db);
  }

  const row = await getThreadRow(db, project, thread.id);
  const byThread = await messagesForThreads(db, [thread.id]);
  return hydrateThread(row!, byThread.get(thread.id) ?? []);
}

export async function addMessage(
  db: PokeDatabase,
  threadId: string,
  message: PokeMessage,
): Promise<void> {
  await db.query(
    `INSERT INTO poke_messages (id, thread_id, author, body, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [message.id, threadId, message.author, message.body, message.createdAt],
  );
  await db.query(`UPDATE poke_threads SET updated_at = $1 WHERE id = $2`, [
    message.createdAt,
    threadId,
  ]);
}

export async function setThreadStatus(
  db: PokeDatabase,
  threadId: string,
  status: ThreadStatus,
  updatedAt: number,
): Promise<void> {
  await db.query(`UPDATE poke_threads SET status = $1, updated_at = $2 WHERE id = $3`, [
    status,
    updatedAt,
    threadId,
  ]);
}

export async function editMessage(
  db: PokeDatabase,
  messageId: string,
  body: string,
  editedAt: number,
): Promise<{ threadId: string } | null> {
  const { rows } = await db.query<{ thread_id: string }>(
    `SELECT thread_id FROM poke_messages WHERE id = $1`,
    [messageId],
  );
  const row = rows[0];
  if (!row) return null;
  await db.query(`UPDATE poke_messages SET body = $1, edited_at = $2 WHERE id = $3`, [
    body,
    editedAt,
    messageId,
  ]);
  await db.query(`UPDATE poke_threads SET updated_at = $1 WHERE id = $2`, [
    editedAt,
    row.thread_id,
  ]);
  return { threadId: row.thread_id };
}

export async function deleteThread(db: PokeDatabase, threadId: string): Promise<void> {
  await db.query(`DELETE FROM poke_threads WHERE id = $1`, [threadId]);
}
