import { describe, expect, it, vi } from "vitest";
import { HttpAdapter } from "./http.js";
import type { PokeThread, PokeUser } from "../core/types.js";
import type { ElementAnchor } from "../anchor/index.js";

const USER: PokeUser = { id: "u1", name: "Ada" };
const ANCHOR: ElementAnchor = {
  v: 1,
  selector: "button",
  path: [{ tag: "body", index: 1 }],
  attrs: {},
  tag: "button",
  offset: { x: 0.5, y: 0.5 },
  viewport: { x: 0, y: 0, scrollX: 0, scrollY: 0 },
};

function thread(id: string): PokeThread {
  const now = Date.now();
  return {
    id,
    pageId: "p1",
    anchor: ANCHOR,
    status: "open",
    createdAt: now,
    updatedAt: now,
    author: USER,
    messages: [
      { id: `${id}-m`, threadId: id, author: USER, body: "hi", createdAt: now },
    ],
  };
}

/** A fetch double that records calls and returns canned JSON. */
function mockFetch(handler: (url: string, init: RequestInit) => unknown) {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = handler(url, init);
    if (body === undefined) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("HttpAdapter", () => {
  it("lists threads from GET /pages/:id/threads", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://api/poke/pages/p1/threads");
      return [thread("t1")];
    });
    const a = new HttpAdapter({ baseUrl: "http://api/poke", fetch, sseUrl: null });
    const list = await a.listThreads("p1");
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("t1");
  });

  it("lists every thread from GET /threads", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("http://api/poke/threads");
      return [thread("t1"), thread("t2")];
    });
    const a = new HttpAdapter({ baseUrl: "http://api/poke", fetch, sseUrl: null });
    const all = await a.listAllThreads();
    expect(all.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("POSTs a new thread as JSON", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetch = mockFetch((url, init) => {
      seen = { url, init };
      return undefined; // 204
    });
    const a = new HttpAdapter({ baseUrl: "http://api", fetch, sseUrl: null });
    await a.createThread(thread("t2"));

    expect(seen!.url).toBe("http://api/threads");
    expect(seen!.init.method).toBe("POST");
    expect(JSON.parse(seen!.init.body as string).id).toBe("t2");
  });

  it("adds a message and returns the server's version", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("http://api/threads/t1/messages");
      expect(JSON.parse(init.body as string)).toEqual({
        body: "a reply",
        author: USER,
      });
      return {
        id: "srv-msg-1",
        threadId: "t1",
        author: USER,
        body: "a reply",
        createdAt: 123,
      };
    });
    const a = new HttpAdapter({ baseUrl: "http://api", fetch, sseUrl: null });
    const msg = await a.addMessage({ threadId: "t1", body: "a reply", author: USER });
    expect(msg.id).toBe("srv-msg-1");
  });

  it("PATCHes status and DELETEs threads", async () => {
    const calls: string[] = [];
    const fetch = mockFetch((url, init) => {
      calls.push(`${init.method} ${url}`);
      return undefined;
    });
    const a = new HttpAdapter({ baseUrl: "http://api", fetch, sseUrl: null });
    await a.updateThread("t1", { status: "resolved" });
    await a.deleteThread("t1");
    expect(calls).toEqual([
      "PATCH http://api/threads/t1",
      "DELETE http://api/threads/t1",
    ]);
  });

  it("merges dynamic auth headers into every request", async () => {
    let headers: Headers | undefined;
    const spyFetch = vi.fn(async (_url: string, init: RequestInit) => {
      headers = new Headers(init.headers);
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;

    const a = new HttpAdapter({
      baseUrl: "http://api",
      fetch: spyFetch,
      sseUrl: null,
      headers: () => ({ Authorization: "Bearer xyz" }),
    });
    await a.listThreads("p1");
    expect(headers?.get("Authorization")).toBe("Bearer xyz");
  });

  it("throws a descriptive error on a non-2xx response", async () => {
    const errFetch = vi.fn(
      async () => new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch;
    const a = new HttpAdapter({
      baseUrl: "http://api",
      fetch: errFetch,
      sseUrl: null,
    });
    await expect(a.listThreads("p1")).rejects.toThrow(/500/);
  });

  it("subscribe is a no-op safe call when realtime is disabled", () => {
    const a = new HttpAdapter({
      baseUrl: "http://api",
      fetch: mockFetch(() => []),
      sseUrl: null,
    });
    const unsub = a.subscribe("p1", () => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
