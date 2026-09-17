/**
 * The routing core: a Web-standard `(Request) => Promise<Response>`. Every
 * framework integration (`next-js.ts`, `node.ts`, ...) is a thin adapter that
 * converts its framework's request shape into a `Request` and its `Response`
 * back into whatever that framework wants — same split as better-auth's
 * `betterAuth().handler` plus its `toNextJsHandler` / `toNodeHandler`.
 *
 * Mounted at a base path of your choosing (conventionally `/api/poke`), it
 * exposes the same routes as the standalone `server/`:
 *
 *   GET    {base}/pages/:pageId/threads
 *   GET    {base}/threads
 *   POST   {base}/threads
 *   POST   {base}/threads/:id/messages
 *   PATCH  {base}/threads/:id
 *   PATCH  {base}/messages/:id
 *   DELETE {base}/threads/:id
 *   GET    {base}/pages/:pageId/events   (SSE; :pageId may be "*")
 */
import { randomUUID } from "node:crypto";
import type { PokeMessage, PokeThread, PokeUser } from "../core/types.js";
import * as db from "./db.js";
import { buildOriginRules, matchOrigin } from "./cors.js";
import { Realtime } from "./realtime.js";
import { resolveConfig, type PokeServerConfig } from "./config.js";

export interface PokeHandlerResult {
  /** `(Request) => Promise<Response>`. Mount this at your base path. */
  handler: (req: Request) => Promise<Response>;
}

function json(status: number, body?: unknown, extraHeaders?: HeadersInit): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function cleanAuthor(a: unknown): PokeUser | null {
  if (!isPlainObject(a) || typeof a.id !== "string" || typeof a.name !== "string") {
    return null;
  }
  const out: PokeUser = { id: a.id.slice(0, 200), name: a.name.slice(0, 120) };
  if (typeof a.color === "string") out.color = a.color.slice(0, 40);
  if (typeof a.avatar === "string") out.avatar = a.avatar.slice(0, 2000);
  return out;
}

/**
 * Build the core handler. `basePath` is the prefix your route file is mounted
 * at (so the handler knows which part of the URL is routing vs. its own base) —
 * pass whatever you used in the route file, e.g. "/api/poke".
 */
export function createPokeHandler(rawConfig: PokeServerConfig): PokeHandlerResult {
  const config = resolveConfig(rawConfig);
  const originRules = buildOriginRules(config.origins);
  const realtime = new Realtime();
  let schemaReady: Promise<void> | null = null;

  function ensureSchemaOnce(): Promise<void> {
    if (!schemaReady) schemaReady = db.ensureSchema(config.database);
    return schemaReady;
  }

  function corsHeaders(req: Request): HeadersInit {
    const allow = matchOrigin(originRules, req.headers.get("origin"));
    const h: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    if (allow) h["Access-Control-Allow-Origin"] = allow;
    if (allow !== "*") h["Vary"] = "Origin";
    return h;
  }

  async function resolveAuthor(
    req: Request,
    bodyAuthor: unknown,
  ): Promise<PokeUser | { error: Response }> {
    if (config.getUser) {
      const user = await config.getUser(req);
      if (user) return user;
      if (!config.allowAnonymous) {
        return { error: json(401, { error: "unauthenticated" }, corsHeaders(req)) };
      }
    }
    const clean = cleanAuthor(bodyAuthor);
    if (!clean) {
      return {
        error: json(422, { error: "missing or invalid author" }, corsHeaders(req)),
      };
    }
    return clean;
  }

  async function readJson(req: Request): Promise<unknown> {
    const len = req.headers.get("content-length");
    if (len && Number(len) > config.maxBodyBytes) {
      const err = new Error("request body too large");
      (err as { status?: number }).status = 413;
      throw err;
    }
    const text = await req.text();
    if (text.length > config.maxBodyBytes) {
      const err = new Error("request body too large");
      (err as { status?: number }).status = 413;
      throw err;
    }
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error("invalid JSON body");
      (err as { status?: number }).status = 400;
      throw err;
    }
  }

  const handler = async (req: Request): Promise<Response> => {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(req) });
      }

      await ensureSchemaOnce();

      const url = new URL(req.url);
      const parts = url.pathname.split("/").filter(Boolean);
      const headers = corsHeaders(req);

      // Routes are matched by their trailing segments, from the end — this way
      // the handler works whatever base path it's mounted at (a Next.js
      // catch-all route, an Express prefix, a bare server with no prefix at
      // all). `last` reads the Nth-from-last segment; `secondLast` etc. read
      // relative to that. Every route below is anchored on a literal keyword
      // (threads / messages / pages / events / health) that never collides
      // with a dynamic id, so this is unambiguous regardless of what comes
      // before it in the URL.
      const last = (n: number) => parts.at(-n);

      // GET .../health
      if (req.method === "GET" && last(1) === "health") {
        await config.database.query("SELECT 1");
        return json(200, { ok: true, project: config.project }, headers);
      }

      // GET .../pages/:pageId/threads  (must check before the app-wide route
      // below, since both end in "threads")
      if (req.method === "GET" && last(1) === "threads" && last(3) === "pages") {
        const pageId = decodeURIComponent(last(2)!);
        return json(200, await db.listThreads(config.database, config.project, pageId), headers);
      }

      // GET .../threads  (all pages in the project)
      if (req.method === "GET" && last(1) === "threads") {
        return json(200, await db.listThreads(config.database, config.project, null), headers);
      }

      // GET .../pages/:pageId/events  (SSE; :pageId may be "*")
      if (req.method === "GET" && last(1) === "events" && last(3) === "pages") {
        if (!config.realtime) return json(404, { error: "realtime disabled" }, headers);
        const pageId = decodeURIComponent(last(2)!);

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const sink = {
              write: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
              close: () => {
                try {
                  controller.close();
                } catch {
                  /* already closed */
                }
              },
            };
            sink.write(`retry: 3000\n\n`);
            const unsub = realtime.subscribe(config.project, pageId, sink);
            req.signal.addEventListener("abort", () => {
              unsub();
              sink.close();
            });
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            ...headers,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      }

      // POST .../threads
      if (req.method === "POST" && last(1) === "threads") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const author = await resolveAuthor(req, body.author);
        if ("error" in author) return author.error;

        if (
          typeof body.id !== "string" ||
          typeof body.pageId !== "string" ||
          !isPlainObject(body.anchor) ||
          !Array.isArray(body.messages)
        ) {
          return json(422, { error: "malformed thread" }, headers);
        }

        const now = Date.now();
        const thread: PokeThread = {
          id: body.id,
          pageId: body.pageId,
          anchor: body.anchor as unknown as PokeThread["anchor"],
          status: body.status === "resolved" ? "resolved" : "open",
          author,
          createdAt: Number(body.createdAt) || now,
          updatedAt: Number(body.updatedAt) || now,
          messages: (body.messages as unknown[]).map((m): PokeMessage => {
            const msg = m as Record<string, unknown>;
            return {
              id: typeof msg.id === "string" ? msg.id : `msg_${randomUUID()}`,
              threadId: body.id as string,
              author: cleanAuthor(msg.author) ?? author,
              body: String(msg.body ?? "").slice(0, 10_000),
              createdAt: Number(msg.createdAt) || now,
              ...(msg.editedAt != null ? { editedAt: Number(msg.editedAt) } : {}),
            };
          }),
        };

        const created = await db.createThread(config.database, config.project, thread);
        realtime.publish(config.project, created.pageId);
        return json(201, created, headers);
      }

      // POST .../threads/:id/messages
      if (req.method === "POST" && last(1) === "messages" && last(3) === "threads") {
        const threadId = decodeURIComponent(last(2)!);
        const row = await db.getThreadRow(config.database, config.project, threadId);
        if (!row) return json(404, { error: "thread not found" }, headers);

        const body = (await readJson(req)) as Record<string, unknown>;
        const author = await resolveAuthor(req, body.author);
        if ("error" in author) return author.error;

        const text = String(body.body ?? "").slice(0, 10_000);
        if (!text.trim()) return json(422, { error: "empty message" }, headers);

        const now = Date.now();
        const message: PokeMessage = {
          id: `msg_${randomUUID()}`,
          threadId,
          author,
          body: text,
          createdAt: now,
        };
        await db.addMessage(config.database, threadId, message);
        realtime.publish(config.project, row.page_id);
        return json(201, message, headers);
      }

      // PATCH .../threads/:id   { status }
      if (req.method === "PATCH" && last(2) === "threads") {
        const threadId = decodeURIComponent(last(1)!);
        const row = await db.getThreadRow(config.database, config.project, threadId);
        if (!row) return json(404, { error: "thread not found" }, headers);

        const body = (await readJson(req)) as { status?: unknown };
        if (body.status !== "open" && body.status !== "resolved") {
          return json(422, { error: "status must be open|resolved" }, headers);
        }
        await db.setThreadStatus(config.database, threadId, body.status, Date.now());
        realtime.publish(config.project, row.page_id);
        return json(200, { ok: true }, headers);
      }

      // PATCH .../messages/:id   { body }
      if (req.method === "PATCH" && last(2) === "messages") {
        const messageId = decodeURIComponent(last(1)!);
        const body = (await readJson(req)) as { body?: unknown };
        const text = String(body.body ?? "").slice(0, 10_000);
        if (!text.trim()) return json(422, { error: "empty message" }, headers);

        const result = await db.editMessage(config.database, messageId, text, Date.now());
        if (!result) return json(404, { error: "message not found" }, headers);
        const thread = await db.getThreadRow(config.database, config.project, result.threadId);
        if (thread) realtime.publish(config.project, thread.page_id);
        return json(200, { ok: true }, headers);
      }

      // DELETE .../threads/:id
      if (req.method === "DELETE" && last(2) === "threads") {
        const threadId = decodeURIComponent(last(1)!);
        const row = await db.getThreadRow(config.database, config.project, threadId);
        if (!row) return json(404, { error: "thread not found" }, headers);
        await db.deleteThread(config.database, threadId);
        realtime.publish(config.project, row.page_id);
        return new Response(null, { status: 204, headers });
      }

      return json(404, { error: "no such route" }, headers);
    } catch (err) {
      const status = (err as { status?: number })?.status ?? 500;
      if (status >= 500) console.error("[poke]", err);
      return json(status, { error: String((err as Error)?.message ?? err) });
    }
  };

  return { handler };
}
