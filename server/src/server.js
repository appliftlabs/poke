#!/usr/bin/env node
/**
 * Poke reference backend — Postgres + SSE realtime.
 *
 * Implements the REST contract that Poke's HttpAdapter expects. Multi-user:
 * every write fans out to connected SSE clients for the same page, so pins
 * appear live for everyone.
 *
 *   GET    /pages/:pageId/threads
 *   POST   /threads                     body: PokeThread
 *   POST   /threads/:id/messages        body: { body, author }
 *   PATCH  /threads/:id                 body: { status }
 *   PATCH  /messages/:id                body: { body }
 *   DELETE /threads/:id
 *   GET    /pages/:pageId/events        SSE stream
 *   GET    /health
 *
 * Env:
 *   DATABASE_URL   required   postgres://user:pass@host:5432/poke
 *   PORT           4000
 *   POKE_ORIGINS   comma-separated allowed origins for CORS.
 *                  "*" allows any (fine for internal tools; not for public).
 *   POKE_PROJECT   logical namespace for this deployment's comments ("default")
 *   POKE_MAX_BODY  max request body bytes (100_000)
 *   PGSSL          "1" force SSL, "0" disable (default: on unless localhost)
 *
 * This has NO authentication. It trusts the `author` the client sends. That is
 * acceptable for a trusted internal audience (a team reviewing staging). For
 * anything public, put it behind your own auth proxy, or fork this and derive
 * the user from a session on every write.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { ensureSchema, hydrateMessage, hydrateThread, pool } from "./db.js";

const PORT = Number(process.env.PORT || 4000);
const PROJECT = process.env.POKE_PROJECT || "default";
const MAX_BODY = Number(process.env.POKE_MAX_BODY || 100_000);
const ORIGINS = (process.env.POKE_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// --- CORS ----------------------------------------------------------------

function corsHeaders(req) {
  const origin = req.headers.origin;
  const allow =
    ORIGINS.includes("*") ? "*" : origin && ORIGINS.includes(origin) ? origin : "";
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (allow) h["Access-Control-Allow-Origin"] = allow;
  if (allow !== "*") h["Vary"] = "Origin";
  return h;
}

// --- helpers -----------------------------------------------------------

function send(res, req, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...corsHeaders(req),
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) {
      const err = new Error("request body too large");
      err.status = 413;
      throw err;
    }
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("invalid JSON body");
    err.status = 400;
    throw err;
  }
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Minimal validation of a user object we're about to persist. */
function cleanAuthor(a) {
  if (!isPlainObject(a) || typeof a.id !== "string" || typeof a.name !== "string") {
    return null;
  }
  const out = { id: a.id.slice(0, 200), name: a.name.slice(0, 120) };
  if (typeof a.color === "string") out.color = a.color.slice(0, 40);
  if (typeof a.avatar === "string") out.avatar = a.avatar.slice(0, 2000);
  return out;
}

// --- realtime (SSE) --------------------------------------------------

/** key `${projectId}::${pageId}` -> Set<ServerResponse> */
const streams = new Map();

function streamKey(pageId) {
  return `${PROJECT}::${pageId}`;
}

function fanout(pageId) {
  const set = streams.get(streamKey(pageId));
  if (!set) return;
  for (const res of set) {
    try {
      res.write(`data: changed\n\n`);
    } catch {
      /* client gone; cleaned up on 'close' */
    }
  }
}

// heartbeat so proxies / load balancers don't drop idle SSE connections
setInterval(() => {
  for (const set of streams.values()) {
    for (const res of set) {
      try {
        res.write(`: ping\n\n`);
      } catch {
        /* ignore */
      }
    }
  }
}, 25_000).unref();

// --- queries ---------------------------------------------------------

async function listThreads(pageId) {
  const { rows: threadRows } = await pool.query(
    `SELECT * FROM poke_threads
       WHERE project_id = $1 AND page_id = $2
       ORDER BY created_at ASC`,
    [PROJECT, pageId],
  );
  if (threadRows.length === 0) return [];

  const ids = threadRows.map((r) => r.id);
  const { rows: msgRows } = await pool.query(
    `SELECT * FROM poke_messages
       WHERE thread_id = ANY($1)
       ORDER BY created_at ASC`,
    [ids],
  );
  const byThread = new Map(ids.map((id) => [id, []]));
  for (const m of msgRows) byThread.get(m.thread_id)?.push(m);

  return threadRows.map((t) => hydrateThread(t, byThread.get(t.id) ?? []));
}

async function getThreadRow(id) {
  const { rows } = await pool.query(
    `SELECT * FROM poke_threads WHERE id = $1 AND project_id = $2`,
    [id, PROJECT],
  );
  return rows[0] ?? null;
}

// --- routing --------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(req));
      return res.end();
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const { method } = req;

    // GET /health
    if (method === "GET" && parts[0] === "health") {
      await pool.query("SELECT 1");
      return send(res, req, 200, { ok: true, project: PROJECT });
    }

    // GET /pages/:pageId/threads
    if (
      method === "GET" &&
      parts[0] === "pages" &&
      parts[2] === "threads" &&
      parts.length === 3
    ) {
      const pageId = decodeURIComponent(parts[1]);
      return send(res, req, 200, await listThreads(pageId));
    }

    // GET /pages/:pageId/events  (SSE)
    if (
      method === "GET" &&
      parts[0] === "pages" &&
      parts[2] === "events" &&
      parts.length === 3
    ) {
      const pageId = decodeURIComponent(parts[1]);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...corsHeaders(req),
      });
      res.write(`retry: 3000\n\n`);
      const key = streamKey(pageId);
      let set = streams.get(key);
      if (!set) streams.set(key, (set = new Set()));
      set.add(res);
      req.on("close", () => {
        set.delete(res);
        if (set.size === 0) streams.delete(key);
      });
      return;
    }

    // POST /threads
    if (method === "POST" && parts[0] === "threads" && parts.length === 1) {
      const t = await readJson(req);
      const author = cleanAuthor(t.author);
      if (
        typeof t.id !== "string" ||
        typeof t.pageId !== "string" ||
        !isPlainObject(t.anchor) ||
        !author ||
        !Array.isArray(t.messages)
      ) {
        return send(res, req, 422, { error: "malformed thread" });
      }
      const now = Date.now();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO poke_threads
             (id, project_id, page_id, anchor, status, author, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [
            t.id,
            PROJECT,
            t.pageId,
            t.anchor,
            t.status === "resolved" ? "resolved" : "open",
            author,
            Number(t.createdAt) || now,
            Number(t.updatedAt) || now,
          ],
        );
        for (const m of t.messages) {
          const mAuthor = cleanAuthor(m.author) ?? author;
          await client.query(
            `INSERT INTO poke_messages
               (id, thread_id, author, body, created_at, edited_at)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO NOTHING`,
            [
              typeof m.id === "string" ? m.id : `msg_${randomUUID()}`,
              t.id,
              mAuthor,
              String(m.body ?? "").slice(0, 10_000),
              Number(m.createdAt) || now,
              m.editedAt != null ? Number(m.editedAt) : null,
            ],
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      fanout(t.pageId);
      const row = await getThreadRow(t.id);
      const { rows: msgs } = await pool.query(
        `SELECT * FROM poke_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
        [t.id],
      );
      return send(res, req, 201, hydrateThread(row, msgs));
    }

    // POST /threads/:id/messages
    if (
      method === "POST" &&
      parts[0] === "threads" &&
      parts[2] === "messages" &&
      parts.length === 3
    ) {
      const threadId = decodeURIComponent(parts[1]);
      const row = await getThreadRow(threadId);
      if (!row) return send(res, req, 404, { error: "thread not found" });

      const payload = await readJson(req);
      const author = cleanAuthor(payload.author) ?? row.author;
      const body = String(payload.body ?? "").slice(0, 10_000);
      if (!body.trim()) return send(res, req, 422, { error: "empty message" });

      const now = Date.now();
      const id = `msg_${randomUUID()}`;
      await pool.query(
        `INSERT INTO poke_messages (id, thread_id, author, body, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, threadId, author, body, now],
      );
      await pool.query(
        `UPDATE poke_threads SET updated_at = $1 WHERE id = $2`,
        [now, threadId],
      );
      fanout(row.page_id);
      const { rows } = await pool.query(
        `SELECT * FROM poke_messages WHERE id = $1`,
        [id],
      );
      return send(res, req, 201, hydrateMessage(rows[0]));
    }

    // PATCH /threads/:id   { status }
    if (method === "PATCH" && parts[0] === "threads" && parts.length === 2) {
      const threadId = decodeURIComponent(parts[1]);
      const row = await getThreadRow(threadId);
      if (!row) return send(res, req, 404, { error: "thread not found" });

      const { status } = await readJson(req);
      if (status !== "open" && status !== "resolved") {
        return send(res, req, 422, { error: "status must be open|resolved" });
      }
      await pool.query(
        `UPDATE poke_threads SET status = $1, updated_at = $2 WHERE id = $3`,
        [status, Date.now(), threadId],
      );
      fanout(row.page_id);
      return send(res, req, 200, { ok: true });
    }

    // PATCH /messages/:id   { body }
    if (method === "PATCH" && parts[0] === "messages" && parts.length === 2) {
      const messageId = decodeURIComponent(parts[1]);
      const { rows } = await pool.query(
        `SELECT m.*, t.page_id, t.project_id
           FROM poke_messages m JOIN poke_threads t ON t.id = m.thread_id
          WHERE m.id = $1`,
        [messageId],
      );
      const msg = rows[0];
      if (!msg || msg.project_id !== PROJECT) {
        return send(res, req, 404, { error: "message not found" });
      }
      const { body } = await readJson(req);
      const clean = String(body ?? "").slice(0, 10_000);
      if (!clean.trim()) return send(res, req, 422, { error: "empty message" });
      const now = Date.now();
      await pool.query(
        `UPDATE poke_messages SET body = $1, edited_at = $2 WHERE id = $3`,
        [clean, now, messageId],
      );
      await pool.query(`UPDATE poke_threads SET updated_at = $1 WHERE id = $2`, [
        now,
        msg.thread_id,
      ]);
      fanout(msg.page_id);
      return send(res, req, 200, { ok: true });
    }

    // DELETE /threads/:id
    if (method === "DELETE" && parts[0] === "threads" && parts.length === 2) {
      const threadId = decodeURIComponent(parts[1]);
      const row = await getThreadRow(threadId);
      if (!row) return send(res, req, 404, { error: "thread not found" });
      await pool.query(`DELETE FROM poke_threads WHERE id = $1`, [threadId]);
      fanout(row.page_id);
      return send(res, req, 204);
    }

    return send(res, req, 404, { error: "no such route" });
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error("[poke-server]", err);
    return send(res, req, status, { error: String(err?.message ?? err) });
  }
});

await ensureSchema();
server.listen(PORT, () => {
  console.log(`[poke-server] listening on :${PORT}`);
  console.log(`  project: ${PROJECT}`);
  console.log(`  CORS:    ${ORIGINS.join(", ")}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`\n[poke-server] ${sig}, shutting down`);
    server.close();
    await pool.end();
    process.exit(0);
  });
}
