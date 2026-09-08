import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageAdapter } from "./local-storage.js";
import type { PokeThread, PokeUser } from "../core/types.js";
import type { ElementAnchor } from "../anchor/index.js";

const USER: PokeUser = { id: "u1", name: "Ada" };

const ANCHOR: ElementAnchor = {
  v: 1,
  selector: "button#x",
  path: [{ tag: "body", index: 1 }],
  attrs: {},
  tag: "button",
  offset: { x: 0.5, y: 0.5 },
  viewport: { x: 0, y: 0, scrollX: 0, scrollY: 0 },
};

function makeThread(id: string, pageId = "page-1"): PokeThread {
  const now = Date.now();
  return {
    id,
    pageId,
    anchor: ANCHOR,
    status: "open",
    createdAt: now,
    updatedAt: now,
    author: USER,
    messages: [
      { id: `${id}-m1`, threadId: id, author: USER, body: "first", createdAt: now },
    ],
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LocalStorageAdapter", () => {
  it("round-trips a thread through storage", () => {
    const a = new LocalStorageAdapter();
    a.createThread(makeThread("t1"));

    const fresh = new LocalStorageAdapter();
    const threads = fresh.listThreads("page-1");
    expect(threads).toHaveLength(1);
    expect(threads[0]?.messages[0]?.body).toBe("first");
  });

  it("keeps pages isolated", () => {
    const a = new LocalStorageAdapter();
    a.createThread(makeThread("t1", "page-1"));
    a.createThread(makeThread("t2", "page-2"));
    expect(a.listThreads("page-1")).toHaveLength(1);
    expect(a.listThreads("page-2")).toHaveLength(1);
  });

  it("appends messages and bumps updatedAt", async () => {
    const a = new LocalStorageAdapter();
    const t = makeThread("t1");
    a.createThread(t);
    await new Promise((r) => setTimeout(r, 2));

    const msg = a.addMessage({ threadId: "t1", body: "a reply", author: USER });
    expect(msg.body).toBe("a reply");

    const [reloaded] = a.listThreads("page-1");
    expect(reloaded?.messages).toHaveLength(2);
    expect(reloaded!.updatedAt).toBeGreaterThan(reloaded!.createdAt);
  });

  it("updates status and deletes threads", () => {
    const a = new LocalStorageAdapter();
    a.createThread(makeThread("t1"));
    a.updateThread("t1", { status: "resolved" });
    expect(a.listThreads("page-1")[0]?.status).toBe("resolved");

    a.deleteThread("t1");
    expect(a.listThreads("page-1")).toHaveLength(0);
  });

  it("edits a message body and stamps editedAt", () => {
    const a = new LocalStorageAdapter();
    a.createThread(makeThread("t1"));
    a.updateMessage("t1-m1", "edited text");
    const msg = a.listThreads("page-1")[0]?.messages[0];
    expect(msg?.body).toBe("edited text");
    expect(msg?.editedAt).toBeTypeOf("number");
  });

  it("notifies local subscribers on create", () => {
    const a = new LocalStorageAdapter();
    const seen = vi.fn();
    a.subscribe("page-1", seen);
    a.createThread(makeThread("t1"));
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ type: "thread:created" }),
    );
  });

  it("throws a clear error when localStorage is unavailable", () => {
    expect(
      () => new LocalStorageAdapter({ storage: undefined as unknown as Storage }),
    ).not.toThrow(); // falls back to window.localStorage, which exists in jsdom
  });

  it("survives corrupt JSON in storage", () => {
    window.localStorage.setItem("poke:threads:page-1", "{not json");
    const a = new LocalStorageAdapter();
    expect(a.listThreads("page-1")).toEqual([]);
  });
});
