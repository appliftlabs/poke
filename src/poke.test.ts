import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { init } from "./poke.js";

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = `<button data-testid="cta">Go</button>`;
  document.getElementById("poke-overlay-host")?.remove();
});

afterEach(() => {
  document.getElementById("poke-overlay-host")?.remove();
});

describe("init", () => {
  it("works with no config — manages a browser-local identity", () => {
    const poke = init();
    expect(poke.identity).not.toBeNull();
    expect(poke.identity!.id).toMatch(/^anon_/);
    expect(poke.identity!.isNamed).toBe(false);
    // store falls back to a placeholder name until one is set
    expect(poke.store.user.name).toBe("Anonymous");
  });

  it("uses a host-provided complete user and skips local identity", () => {
    const poke = init({ user: { id: "u1", name: "Ada" } });
    expect(poke.identity).toBeNull();
    expect(poke.store.user).toEqual({ id: "u1", name: "Ada" });
  });

  it("seeds the local identity name from a partial user", () => {
    const poke = init({ user: { name: "Sam" } });
    expect(poke.identity).not.toBeNull();
    expect(poke.identity!.isNamed).toBe(true);
    expect(poke.store.user.name).toBe("Sam");
  });

  it("mounts an isolated shadow-DOM overlay with a toolbar", async () => {
    const poke = init({ user: { id: "u1", name: "Ada" }, pageId: "p1" });
    await poke.store.start();
    poke.mount();

    const host = document.getElementById("poke-overlay-host");
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();

    const toolbar = host!.shadowRoot!.querySelector(".poke-toolbar");
    expect(toolbar?.textContent).toContain("Comment");

    await poke.destroy();
    expect(document.getElementById("poke-overlay-host")).toBeNull();
  });

  it("defaults pageId to the current pathname", async () => {
    const poke = init({ user: { id: "u1", name: "Ada" } });
    expect(poke.store.pageId).toBe(location.pathname);
    await poke.destroy();
  });

  it("renders a pin for a thread created through the store", async () => {
    const poke = init({ user: { id: "u1", name: "Ada" }, pageId: "p1" });
    await poke.store.start();
    poke.mount();

    const { captureAnchor } = await import("./anchor/index.js");
    const el = document.querySelector<HTMLElement>("button")!;
    await poke.store.createThread({
      anchor: captureAnchor(el, { clientX: 1, clientY: 1 }),
      body: "wrong label",
    });

    // Let Preact flush (rerender is scheduled via store.subscribe → setState).
    await new Promise((r) => setTimeout(r, 20));
    const shadow = document.getElementById("poke-overlay-host")!.shadowRoot!;
    expect(poke.store.list()).toHaveLength(1);
    expect(shadow.querySelectorAll(".poke-pin").length).toBe(1);

    await poke.destroy();
  });

  it("doesn't show the draft composer and the name prompt at once", async () => {
    // Regression test: submitting a comment while unnamed used to leave the
    // "New comment" composer rendered underneath the name prompt (the draft
    // state was never cleared when the name gate took over), showing two
    // stacked dialogs at once.
    const poke = init({ pageId: "p1" }); // no `user` -> unnamed local identity
    await poke.store.start();
    poke.mount();

    const shadow = document.getElementById("poke-overlay-host")!.shadowRoot!;
    const toolbar = shadow.querySelector<HTMLElement>(".poke-toolbar")!;
    const commentToggle = toolbar.querySelector("button")!;
    commentToggle.click(); // enter comment mode
    await new Promise((r) => setTimeout(r, 20)); // flush the mode-change effect

    const target = document.querySelector<HTMLElement>("button[data-testid='cta']")!;
    target.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 5,
        clientY: 5,
      }),
    );
    await new Promise((r) => setTimeout(r, 20));

    const textarea = shadow.querySelector<HTMLTextAreaElement>(".poke-card textarea");
    expect(textarea).not.toBeNull();
    textarea!.value = "This needs a fix";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));

    const submit = [...shadow.querySelectorAll("button")].find(
      (b) => b.textContent === "Comment",
    )!;
    submit.click();
    await new Promise((r) => setTimeout(r, 20));

    // Exactly one poke-card should be visible: the name prompt, not the draft
    // composer stacked underneath it.
    const cards = shadow.querySelectorAll(".poke-card");
    expect(cards.length).toBe(1);
    expect(cards[0]!.textContent).toContain("Add your name");

    await poke.destroy();
  });

  describe("enabled gate", () => {
    it("runs by default (enabled omitted)", async () => {
      const poke = init({ user: { id: "u1", name: "Ada" }, pageId: "p1" });
      await poke.store.start();
      poke.mount();
      expect(document.getElementById("poke-overlay-host")).not.toBeNull();
      await poke.destroy();
    });

    for (const val of ["production", false, "prod", "anything-else", "PRODUCTION"] as const) {
      it(`is inert when enabled=${JSON.stringify(val)}`, () => {
        const poke = init({
          user: { id: "u1", name: "Ada" },
          pageId: "p1",
          enabled: val,
        });
        poke.mount(); // no-op
        expect(document.getElementById("poke-overlay-host")).toBeNull();
        expect(poke.identity).toBeNull();
        // store exists but is inert
        expect(poke.store.list()).toEqual([]);
      });
    }

    for (const val of ["development", "dev", "staging", "test", "preview", true] as const) {
      it(`runs when enabled=${JSON.stringify(val)}`, async () => {
        const poke = init({
          user: { id: "u1", name: "Ada" },
          pageId: "p1",
          enabled: val,
        });
        await poke.store.start();
        poke.mount();
        expect(document.getElementById("poke-overlay-host")).not.toBeNull();
        await poke.destroy();
      });
    }

    it("accepts a function predicate", () => {
      const off = init({ user: { id: "u1", name: "Ada" }, enabled: () => false });
      off.mount();
      expect(document.getElementById("poke-overlay-host")).toBeNull();

      const on = init({
        user: { id: "u1", name: "Ada" },
        pageId: "p1",
        enabled: () => "development",
      });
      on.mount();
      expect(document.getElementById("poke-overlay-host")).not.toBeNull();
      on.destroy();
    });

    it("a throwing predicate fails safe (off)", () => {
      const poke = init({
        user: { id: "u1", name: "Ada" },
        enabled: () => {
          throw new Error("flag service down");
        },
      });
      poke.mount();
      expect(document.getElementById("poke-overlay-host")).toBeNull();
    });

    it("tears down an overlay left by a previous enabled init", async () => {
      const live = init({ user: { id: "u1", name: "Ada" }, pageId: "p1" });
      await live.store.start();
      live.mount();
      expect(document.getElementById("poke-overlay-host")).not.toBeNull();

      // Re-init disabled (e.g. env flag flipped, HMR) — should remove the overlay.
      init({ user: { id: "u1", name: "Ada" }, pageId: "p1", enabled: false });
      expect(document.getElementById("poke-overlay-host")).toBeNull();
    });

    it("store writes while disabled are silently dropped, not thrown", async () => {
      const poke = init({ user: { id: "u1", name: "Ada" }, enabled: false });
      const { captureAnchor } = await import("./anchor/index.js");
      const el = document.querySelector<HTMLElement>("button")!;
      // Should not throw, and should not persist anything.
      await poke.store.createThread({
        anchor: captureAnchor(el, { clientX: 0, clientY: 0 }),
        body: "x",
      });
      expect(poke.store.list()).toEqual([]);
    });
  });
});
