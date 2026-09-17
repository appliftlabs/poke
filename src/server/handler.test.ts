/**
 * @vitest-environment node
 *
 * Integration test for createPoke()'s handler, against a real local Postgres.
 * Forced to the `node` environment (the project default is jsdom) — this
 * handler is server-side code using Node's native Request/Response/
 * ReadableStream/AbortController, which are NOT the same classes as jsdom's.
 * Skips itself (rather than failing) when POKE_TEST_DATABASE_URL isn't set —
 * CI/dev without a local Postgres still gets a green run, just without this
 * coverage. Run locally with e.g.:
 *
 *   POKE_TEST_DATABASE_URL=postgres://you@localhost:5432/poke_dev npx vitest run src/server
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPoke } from "./index.js";
import type { PokeUser } from "../core/types.js";

const DATABASE_URL = process.env.POKE_TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

const ADA: PokeUser = { id: "u1", name: "Ada" };
const ANCHOR = {
  v: 1,
  selector: "button",
  path: [{ tag: "body", index: 1 }],
  attrs: {},
  tag: "button",
  offset: { x: 0.5, y: 0.5 },
  viewport: { x: 0, y: 0, scrollX: 0, scrollY: 0 },
};

describeIfDb("createPoke handler (real Postgres)", () => {
  // Imported lazily so the module (and its `pg` dependency) is only touched
  // when this suite actually runs.
  let Pool: typeof import("pg").Pool;
  let pool: InstanceType<typeof import("pg").Pool>;
  const project = `handler-test-${Date.now()}`;

  beforeEach(async () => {
    if (!Pool) ({ Pool } = await import("pg"));
    pool ??= new Pool({ connectionString: DATABASE_URL });
    await pool.query("DELETE FROM poke_threads WHERE project_id LIKE 'handler-test-%'");
  });

  afterAll(async () => {
    await pool?.query("DELETE FROM poke_threads WHERE project_id LIKE 'handler-test-%'");
    await pool?.end();
  });

  function makePoke(opts: Partial<Parameters<typeof createPoke>[0]> = {}) {
    return createPoke({
      database: pool,
      project,
      allowAnonymous: true,
      realtime: true,
      ...opts,
    });
  }

  function req(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Request {
    return new Request(`http://localhost${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      headers: { "content-type": "application/json", ...headers },
    });
  }

  it("creates a thread, lists it per-page and app-wide, replies, resolves, deletes", async () => {
    const { handler } = makePoke();

    const thread = {
      id: `thr_${Date.now()}`,
      pageId: "/dashboard",
      anchor: ANCHOR,
      status: "open",
      author: ADA,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { id: `msg_${Date.now()}`, body: "hello", author: ADA, createdAt: Date.now() },
      ],
    };

    const created = await handler(req("POST", "/api/poke/threads", thread));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.id).toBe(thread.id);
    expect(createdBody.messages).toHaveLength(1);

    // per-page list
    const pageList = await handler(
      req("GET", `/api/poke/pages/${encodeURIComponent("/dashboard")}/threads`),
    );
    expect(pageList.status).toBe(200);
    expect(await pageList.json()).toHaveLength(1);

    // a different page sees nothing
    const otherPage = await handler(
      req("GET", `/api/poke/pages/${encodeURIComponent("/settings")}/threads`),
    );
    expect(await otherPage.json()).toEqual([]);

    // app-wide list sees it
    const all = await handler(req("GET", "/api/poke/threads"));
    expect(await all.json()).toHaveLength(1);

    // reply
    const reply = await handler(
      req("POST", `/api/poke/threads/${thread.id}/messages`, {
        body: "a reply",
        author: ADA,
      }),
    );
    expect(reply.status).toBe(201);
    expect((await reply.json()).body).toBe("a reply");

    // resolve
    const resolved = await handler(
      req("PATCH", `/api/poke/threads/${thread.id}`, { status: "resolved" }),
    );
    expect(resolved.status).toBe(200);
    const afterResolve = await (
      await handler(req("GET", `/api/poke/pages/${encodeURIComponent("/dashboard")}/threads`))
    ).json();
    expect(afterResolve[0].status).toBe("resolved");
    expect(afterResolve[0].messages).toHaveLength(2);

    // delete
    const del = await handler(req("DELETE", `/api/poke/threads/${thread.id}`));
    expect(del.status).toBe(204);
    expect(await (await handler(req("GET", "/api/poke/threads"))).json()).toEqual([]);
  });

  it("401s when getUser rejects and allowAnonymous is off", async () => {
    const { handler } = makePoke({ allowAnonymous: false, getUser: () => null });
    const res = await handler(
      req("POST", "/api/poke/threads", {
        id: "thr_x",
        pageId: "/x",
        anchor: ANCHOR,
        messages: [],
      }),
    );
    expect(res.status).toBe(401);
  });

  it("derives the author from getUser, ignoring a client-supplied one", async () => {
    const real: PokeUser = { id: "server-derived", name: "Real User" };
    const { handler } = makePoke({ allowAnonymous: false, getUser: () => real });

    const id = `thr_auth_${Date.now()}`;
    const res = await handler(
      req("POST", "/api/poke/threads", {
        id,
        pageId: "/auth-test",
        anchor: ANCHOR,
        author: { id: "spoofed", name: "Not Real" }, // should be ignored
        messages: [{ body: "hi" }],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.author).toEqual(real);
    expect(body.messages[0].author).toEqual(real);
  });

  it("422s on malformed thread bodies", async () => {
    const { handler } = makePoke();
    const res = await handler(req("POST", "/api/poke/threads", { nope: true }));
    expect(res.status).toBe(422);
  });

  it("404s on unknown thread/message ids", async () => {
    const { handler } = makePoke();
    expect((await handler(req("DELETE", "/api/poke/threads/nope"))).status).toBe(404);
    expect(
      (await handler(req("PATCH", "/api/poke/messages/nope", { body: "x" }))).status,
    ).toBe(404);
  });

  it("sends CORS headers matching the configured origins", async () => {
    const { handler } = makePoke({ origins: "https://allowed.dev" });
    const res = await handler(
      req("GET", "/api/poke/threads", undefined, { origin: "https://allowed.dev" }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://allowed.dev");

    const denied = await handler(
      req("GET", "/api/poke/threads", undefined, { origin: "https://evil.dev" }),
    );
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("streams an SSE response for the events route", async () => {
    const { handler } = makePoke();
    const controller = new AbortController();
    const res = await handler(
      new Request("http://localhost/api/poke/pages/%2A/events", {
        signal: controller.signal,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("retry:");
    controller.abort();
  });
});
