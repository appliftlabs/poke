import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentStore } from "./store.js";
import { LocalStorageAdapter } from "../adapters/local-storage.js";
import { captureAnchor } from "../anchor/index.js";
import type { PokeUser } from "./types.js";

const USER: PokeUser = { id: "u1", name: "Ada", color: "#e11" };

function anchorFor(html: string, selector: string) {
  document.body.innerHTML = html;
  const el = document.querySelector<HTMLElement>(selector)!;
  return captureAnchor(el, { clientX: 0, clientY: 0 });
}

function makeStore() {
  return new CommentStore({
    adapter: new LocalStorageAdapter(),
    pageId: "page-1",
    user: USER,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("CommentStore", () => {
  it("creates a thread with the current user as author and one message", async () => {
    const store = makeStore();
    await store.start();

    const anchor = anchorFor(`<button data-testid="cta">Go</button>`, "button");
    const thread = await store.createThread({ anchor, body: "wrong colour" });

    expect(thread.author).toEqual(USER);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]?.body).toBe("wrong colour");
    expect(store.list()).toHaveLength(1);
  });

  it("resolves each thread's anchor and reports found/confidence", async () => {
    const store = makeStore();
    await store.start();
    const anchor = anchorFor(`<a href="/x" data-testid="lnk">Link</a>`, "a");
    await store.createThread({ anchor, body: "note" });

    const [t] = store.list();
    expect(t?.resolution?.found).toBe(true);

    // Remove the element and re-resolve.
    document.body.innerHTML = "<p>gone</p>";
    store.reresolve();
    expect(store.list()[0]?.resolution?.found).toBe(false);
    expect(store.list()[0]?.resolution?.confidence).toBe("lost");
  });

  it("appends replies", async () => {
    const store = makeStore();
    await store.start();
    const anchor = anchorFor(`<button data-testid="b">B</button>`, "button");
    const t = await store.createThread({ anchor, body: "first" });

    await store.reply(t.id, "second");
    expect(store.getThread(t.id)?.messages.map((m) => m.body)).toEqual([
      "first",
      "second",
    ]);
  });

  it("attributes a reply to the current user, not the thread author", async () => {
    const store = makeStore();
    await store.start();
    const anchor = anchorFor(`<button data-testid="b">B</button>`, "button");
    const t = await store.createThread({ anchor, body: "from Ada" });

    store.setUser({ id: "u2", name: "Grace" });
    await store.reply(t.id, "from Grace");

    const msgs = store.getThread(t.id)!.messages;
    expect(msgs[0]?.author.name).toBe("Ada");
    expect(msgs[1]?.author.name).toBe("Grace");
  });

  it("setUser notifies subscribers", async () => {
    const store = makeStore();
    await store.start();
    const seen = vi.fn();
    store.subscribe(seen);
    store.setUser({ id: "u9", name: "Nine" });
    expect(seen).toHaveBeenCalled();
    expect(store.user.name).toBe("Nine");
  });

  it("toggles status", async () => {
    const store = makeStore();
    await store.start();
    const anchor = anchorFor(`<button data-testid="b">B</button>`, "button");
    const t = await store.createThread({ anchor, body: "x" });

    await store.setStatus(t.id, "resolved");
    expect(store.getThread(t.id)?.status).toBe("resolved");
  });

  it("deletes a thread", async () => {
    const store = makeStore();
    await store.start();
    const anchor = anchorFor(`<button data-testid="b">B</button>`, "button");
    const t = await store.createThread({ anchor, body: "x" });

    await store.deleteThread(t.id);
    expect(store.list()).toHaveLength(0);
  });

  it("notifies subscribers on every change", async () => {
    const store = makeStore();
    await store.start();
    const seen = vi.fn();
    store.subscribe(seen);

    const anchor = anchorFor(`<button data-testid="b">B</button>`, "button");
    const t = await store.createThread({ anchor, body: "x" });
    await store.reply(t.id, "y");
    await store.setStatus(t.id, "resolved");

    expect(seen.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("picks up a sibling adapter's writes via the reload event", async () => {
    const shared = new LocalStorageAdapter();
    const storeA = new CommentStore({
      adapter: shared,
      pageId: "page-1",
      user: USER,
    });
    await storeA.start();

    // A second store on the SAME adapter instance (simulating another client
    // that shares the realtime channel).
    const storeB = new CommentStore({
      adapter: shared,
      pageId: "page-1",
      user: { id: "u2", name: "Grace" },
    });
    await storeB.start();

    const anchor = anchorFor(`<button data-testid="b">B</button>`, "button");
    await storeA.createThread({ anchor, body: "from A" });

    // storeB subscribed to the same adapter, so its list should now include it.
    expect(storeB.list().some((t) => t.messages[0]?.body === "from A")).toBe(true);
  });

  describe("app-wide thread list (listAll)", () => {
    it("list() is the current page; listAll() spans every page", async () => {
      const shared = new LocalStorageAdapter();
      const onDash = new CommentStore({
        adapter: shared,
        pageId: "/dashboard",
        user: USER,
      });
      const onSettings = new CommentStore({
        adapter: shared,
        pageId: "/settings",
        user: USER,
      });
      await onDash.start();
      await onSettings.start();

      const a = anchorFor(`<button data-testid="d">D</button>`, "button");
      await onDash.createThread({ anchor: a, body: "on dashboard" });
      const b = anchorFor(`<button data-testid="s">S</button>`, "button");
      await onSettings.createThread({ anchor: b, body: "on settings" });

      await onDash.refresh();

      // Pins on /dashboard: just the dashboard thread.
      expect(onDash.list().map((t) => t.messages[0]?.body)).toEqual([
        "on dashboard",
      ]);
      // Sidebar: both.
      expect(onDash.listAll().map((t) => t.messages[0]?.body).sort()).toEqual([
        "on dashboard",
        "on settings",
      ]);
    });

    it("falls back to the current page when the adapter can't list app-wide", async () => {
      // An adapter without listAllThreads.
      const minimal = {
        listThreads: () => [
          {
            id: "t1",
            pageId: "p1",
            anchor: anchorFor(`<button>x</button>`, "button"),
            status: "open" as const,
            createdAt: 1,
            updatedAt: 1,
            author: USER,
            messages: [],
          },
        ],
        createThread: () => {},
        addMessage: () => ({
          id: "m",
          threadId: "t1",
          author: USER,
          body: "",
          createdAt: 1,
        }),
        updateThread: () => {},
        updateMessage: () => {},
        deleteThread: () => {},
      };
      const store = new CommentStore({
        adapter: minimal,
        pageId: "p1",
        user: USER,
      });
      await store.start();
      expect(store.listAll()).toEqual(store.list());
      expect(store.listAll()).toHaveLength(1);
    });
  });
});
