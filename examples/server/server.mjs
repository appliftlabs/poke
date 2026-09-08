/**
 * Reference Poke backend — a persistent, independent store.
 *
 * ~200 lines, no dependencies: Node's built-in http server + built-in SQLite
 * (node:sqlite, Node 22+). It implements exactly the REST contract that
 * `HttpAdapter` expects, including an SSE stream for cross-client realtime.
 *
 * Run:   node examples/server/server.mjs
 *        (writes examples/server/poke.db)
 *
 * Then point the client at it:
 *
 *   import { init, HttpAdapter } from "@applift/poke";
 *   init({
 *     user: { id: "u1", name: "Ada" },
 *     adapter: new HttpAdapter({ baseUrl: "http://localhost:4000" }),
 *   });
 *
 * This is a teaching implementation. For production you'd add: auth (derive the
 * user server-side, don't trust the client), per-project scoping, rate limits,
 * input size caps, and a real migration story. The schema and routes stay the
 * same.
 */
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// --- storage ---------------------------------------------------------------

const db = new DatabaseSync(join(__dirname, "poke.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id         TEXT PRIMARY KEY,
    page_id    TEXT NOT NULL,
    anchor     TEXT NOT NULL,           -- JSON
    status     TEXT NOT NULL DEFAULT 'open',
    author     TEXT NOT NULL,           -- JSON
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS threads_page ON threads(page_id);

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    author     TEXT NOT NULL,           -- JSON
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id);
`);

const q = {
  threadsByPage: db.prepare(
    "SELECT * FROM threads WHERE page_id = ? ORDER BY created_at ASC",
  ),
  messagesByThread: db.prepare(
    "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC",
  ),
  thread: db.prepare("SELECT * FROM threads WHERE id = ?"),
  message: db.prepare("SELECT * FROM messages WHERE id = ?"),
  insertThread: db.prepare(
    `INSERT INTO threads (id, page_id, anchor, status, author, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  insertMessage: db.prepare(
    `INSERT INTO messages (id, thread_id, author, body, created_at, edited_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  touchThread: db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?"),
  setThreadStatus: db.prepare(
    "UPDATE threads SET status = ?, updated_at = ? WHERE id = ?",
  ),
  editMessage: db.prepare(
    "UPDATE messages SET body = ?, edited_at = ? WHERE id = ?",
  ),
  deleteThread: db.prepare("DELETE FROM threads WHERE id = ?"),
  deleteThreadMessages: db.prepare("DELETE FROM messages WHERE thread_id = ?"),
};

function hydrateThread(row) {
  return {
    id: row.id,
    pageId: row.page_id,
    anchor: JSON.parse(row.anchor),
    status: row.status,
    author: JSON.parse(row.author),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: q.messagesByThread.all(row.id).map(hydrateMessage),
  };
}

function hydrateMessage(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: JSON.parse(row.author),
    body: row.body,
    createdAt: row.created_at,
    ...(row.edited_at ? { editedAt: row.edited_at } : {}),
  };
}

// --- realtime (SSE) -------------------------------------------------------

/** pageId -> Set<ServerResponse> */
const streams = new Map();

function notify(pageId) {
  const set = streams.get(pageId);
  if (!set) return;
  for (const res of set) res.write(`data: changed\n\n`);
}

// --- http ---------------------------------------------------------------

function send(res, status, body) {
  const json = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(json);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const { method } = req;

    if (method === "OPTIONS") return send(res, 204);

    // GET /pages/:pageId/threads
    if (
      method === "GET" &&
      parts[0] === "pages" &&
      parts[2] === "threads" &&
      parts.length === 3
    ) {
      const rows = q.threadsByPage.all(decodeURIComponent(parts[1]));
      return send(res, 200, rows.map(hydrateThread));
    }

    // GET /pages/:pageId/events   (SSE)
    if (
      method === "GET" &&
      parts[0] === "pages" &&
      parts[2] === "events" &&
      parts.length === 3
    ) {
      const pageId = decodeURIComponent(parts[1]);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`retry: 3000\n\n`);
      let set = streams.get(pageId);
      if (!set) streams.set(pageId, (set = new Set()));
      set.add(res);
      req.on("close", () => set.delete(res));
      return;
    }

    // POST /threads
    if (method === "POST" && parts[0] === "threads" && parts.length === 1) {
      const t = await readJson(req);
      q.insertThread.run(
        t.id,
        t.pageId,
        JSON.stringify(t.anchor),
        t.status ?? "open",
        JSON.stringify(t.author),
        t.createdAt,
        t.updatedAt,
      );
      for (const m of t.messages ?? []) {
        q.insertMessage.run(
          m.id,
          t.id,
          JSON.stringify(m.author),
          m.body,
          m.createdAt,
          m.editedAt ?? null,
        );
      }
      notify(t.pageId);
      return send(res, 201, hydrateThread(q.thread.get(t.id)));
    }

    // POST /threads/:id/messages
    if (
      method === "POST" &&
      parts[0] === "threads" &&
      parts[2] === "messages" &&
      parts.length === 3
    ) {
      const threadId = decodeURIComponent(parts[1]);
      const row = q.thread.get(threadId);
      if (!row) return send(res, 404, { error: "thread not found" });
      const { body } = await readJson(req);
      const now = Date.now();
      const id = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
      q.insertMessage.run(
        id,
        threadId,
        row.author, // reply attributed to... see note below
        String(body ?? ""),
        now,
        null,
      );
      q.touchThread.run(now, threadId);
      notify(row.page_id);
      return send(res, 201, hydrateMessage(q.message.get(id)));
    }

    // PATCH /threads/:id
    if (method === "PATCH" && parts[0] === "threads" && parts.length === 2) {
      const threadId = decodeURIComponent(parts[1]);
      const row = q.thread.get(threadId);
      if (!row) return send(res, 404, { error: "thread not found" });
      const patch = await readJson(req);
      if (patch.status) {
        q.setThreadStatus.run(patch.status, Date.now(), threadId);
        notify(row.page_id);
      }
      return send(res, 200, { ok: true });
    }

    // PATCH /messages/:id
    if (method === "PATCH" && parts[0] === "messages" && parts.length === 2) {
      const messageId = decodeURIComponent(parts[1]);
      const row = q.message.get(messageId);
      if (!row) return send(res, 404, { error: "message not found" });
      const { body } = await readJson(req);
      q.editMessage.run(String(body ?? ""), Date.now(), messageId);
      const thread = q.thread.get(row.thread_id);
      notify(thread.page_id);
      return send(res, 200, { ok: true });
    }

    // DELETE /threads/:id
    if (method === "DELETE" && parts[0] === "threads" && parts.length === 2) {
      const threadId = decodeURIComponent(parts[1]);
      const row = q.thread.get(threadId);
      if (!row) return send(res, 404, { error: "thread not found" });
      q.deleteThreadMessages.run(threadId);
      q.deleteThread.run(threadId);
      notify(row.page_id);
      return send(res, 204);
    }

    return send(res, 404, { error: "no such route" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(PORT, () => {
  console.log(`Poke reference server on http://localhost:${PORT}`);
  console.log(`  DB: ${join(__dirname, "poke.db")}`);
});

/*
 * NOTE on reply attribution: this reference stores the reply's author as the
 * thread author, because it has no auth and can't trust a client-sent user.
 * A real backend derives the user from the session/token on every write and
 * passes it into insertMessage. The client's HttpAdapter deliberately sends
 * only { body } for a reply for this reason.
 */
