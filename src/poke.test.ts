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
});
