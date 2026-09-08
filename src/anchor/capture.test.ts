import { beforeEach, describe, expect, it } from "vitest";
import { captureAnchor } from "./capture.js";

const CLICK = { clientX: 0, clientY: 0 };

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("captureAnchor", () => {
  it("captures tag, text, and a resolvable selector", () => {
    document.body.innerHTML = `
      <main>
        <section>
          <button id="save-btn" data-testid="save">Save changes</button>
        </section>
      </main>`;
    const el = document.querySelector<HTMLElement>("#save-btn")!;

    const anchor = captureAnchor(el, CLICK);

    expect(anchor.v).toBe(1);
    expect(anchor.tag).toBe("button");
    expect(anchor.text).toBe("Save changes");
    expect(anchor.id).toBe("save-btn");
    expect(anchor.attrs["data-testid"]).toBe("save");
    expect(document.querySelectorAll(anchor.selector)).toHaveLength(1);
    expect(document.querySelector(anchor.selector)).toBe(el);
  });

  it("ignores framework-generated ids", () => {
    document.body.innerHTML = `<div id=":r7:">hi</div>`;
    const el = document.querySelector<HTMLElement>("div")!;
    const anchor = captureAnchor(el, CLICK);
    expect(anchor.id).toBeUndefined();
  });

  it("records a structural path rooted at body", () => {
    document.body.innerHTML = `<ul><li>a</li><li>b</li><li>c</li></ul>`;
    const third = document.querySelectorAll<HTMLElement>("li")[2]!;
    const anchor = captureAnchor(third, CLICK);

    expect(anchor.path[0]?.tag).toBe("body");
    const last = anchor.path.at(-1)!;
    expect(last).toEqual({ tag: "li", index: 3 });
  });

  it("clamps the click offset to 0..1 and defaults to centre without a box", () => {
    document.body.innerHTML = `<button>x</button>`;
    const el = document.querySelector<HTMLElement>("button")!;
    // jsdom has no layout, so getBoundingClientRect is all zeros.
    const anchor = captureAnchor(el, { clientX: 9999, clientY: -50 });
    expect(anchor.offset).toEqual({ x: 0.5, y: 0.5 });
  });

  it("collects only non-empty identifying attributes", () => {
    document.body.innerHTML = `<a href="/pricing" aria-label="Pricing" title="">Pricing</a>`;
    const el = document.querySelector<HTMLElement>("a")!;
    const anchor = captureAnchor(el, CLICK);
    expect(anchor.attrs).toEqual({
      href: "/pricing",
      "aria-label": "Pricing",
    });
  });
});
