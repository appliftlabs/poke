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
});
