import { beforeEach, describe, expect, it } from "vitest";
import { captureAnchor } from "./capture.js";
import { resolveAnchor } from "./resolve.js";

const CLICK = { clientX: 0, clientY: 0 };

beforeEach(() => {
  document.body.innerHTML = "";
});

/** Capture an anchor from the current DOM, then mutate the DOM and re-resolve. */
function captureThenMutate(selector: string, mutate: () => void) {
  const el = document.querySelector<HTMLElement>(selector)!;
  const anchor = captureAnchor(el, CLICK);
  mutate();
  return resolveAnchor(anchor);
}

describe("resolveAnchor — happy path", () => {
  it("re-finds an unchanged element with high confidence", () => {
    document.body.innerHTML = `
      <nav><a href="/docs" data-testid="docs-link">Docs</a></nav>`;
    const target = document.querySelector<HTMLElement>("a")!;
    const anchor = captureAnchor(target, CLICK);

    const resolved = resolveAnchor(anchor);
    expect(resolved.element).toBe(target);
    expect(["exact", "high"]).toContain(resolved.confidence);
  });
});

describe("resolveAnchor — resilience to DOM churn", () => {
  it("survives a class rename when the test id is intact", () => {
    document.body.innerHTML = `
      <div class="card old-card">
        <button class="btn btn-primary" data-testid="cta">Buy now</button>
      </div>`;
    const resolved = captureThenMutate('[data-testid="cta"]', () => {
      const btn = document.querySelector("button")!;
      btn.className = "button button--accent"; // full class churn
      document.querySelector(".card")!.className = "card card--v2";
    });

    expect(resolved.element).not.toBeNull();
    expect(resolved.element?.getAttribute("data-testid")).toBe("cta");
  });

  it("survives an id change when structure + text are stable", () => {
    document.body.innerHTML = `
      <section>
        <h2>Pricing</h2>
        <p id="blurb-8f2a">Simple, transparent pricing for teams.</p>
      </section>`;
    const resolved = captureThenMutate("#blurb-8f2a", () => {
      document.querySelector("p")!.id = "blurb-1c9d"; // regenerated on deploy
    });

    expect(resolved.element).not.toBeNull();
    expect(resolved.element?.tagName).toBe("P");
  });

  it("survives a new wrapper element being inserted around the target", () => {
    document.body.innerHTML = `
      <main>
        <button data-testid="submit">Submit</button>
      </main>`;
    const resolved = captureThenMutate('[data-testid="submit"]', () => {
      const btn = document.querySelector("button")!;
      const wrap = document.createElement("div");
      wrap.className = "tooltip-wrapper";
      btn.replaceWith(wrap);
      wrap.appendChild(btn);
    });

    expect(resolved.element).not.toBeNull();
    expect(resolved.element?.getAttribute("data-testid")).toBe("submit");
  });

  it("picks the right item when siblings are reordered", () => {
    document.body.innerHTML = `
      <ul>
        <li data-testid="row-a">Alpha</li>
        <li data-testid="row-b">Bravo</li>
        <li data-testid="row-c">Charlie</li>
      </ul>`;
    const resolved = captureThenMutate('[data-testid="row-b"]', () => {
      const ul = document.querySelector("ul")!;
      ul.prepend(ul.children[2]!); // move Charlie to the front
    });

    expect(resolved.element?.getAttribute("data-testid")).toBe("row-b");
    expect(resolved.element?.textContent).toBe("Bravo");
  });
});

describe("resolveAnchor — lost elements", () => {
  it("reports 'lost' with a null element when the target is gone", () => {
    document.body.innerHTML = `<button data-testid="temp">Ephemeral</button>`;
    const resolved = captureThenMutate('[data-testid="temp"]', () => {
      document.body.innerHTML = `<p>totally different page</p>`;
    });

    expect(resolved.element).toBeNull();
    expect(resolved.confidence).toBe("lost");
  });

  it("does not confidently match a same-tag element with different everything", () => {
    document.body.innerHTML = `
      <div><button data-testid="a" class="x">Original label</button></div>`;
    const resolved = captureThenMutate('[data-testid="a"]', () => {
      document.body.innerHTML = `
        <section><button data-testid="z" class="y">Unrelated button</button></section>`;
    });

    // Either lost, or matched but explicitly low confidence — never "high".
    expect(["low", "medium", "lost"]).toContain(resolved.confidence);
  });
});

describe("resolveAnchor — realistic redeploys", () => {
  it("survives a full framework re-render: new hashed classes, regenerated ids", () => {
    document.body.innerHTML = `
      <div id="root">
        <div class="css-1a2b3c" id=":r1:">
          <header class="css-9f8e7d">
            <button class="css-4b4b4b" id=":r2:" aria-label="Open menu">Menu</button>
          </header>
        </div>
      </div>`;
    const target = document.querySelector<HTMLElement>("button")!;
    const anchor = captureAnchor(target, CLICK);

    // Simulate a rebuild: every hashed class and generated id changes,
    // structure and the aria-label stay put.
    document.body.innerHTML = `
      <div id="root">
        <div class="css-x9y8z7" id=":r9:">
          <header class="css-a1a1a1">
            <button class="css-c2c2c2" id=":r8:" aria-label="Open menu">Menu</button>
          </header>
        </div>
      </div>`;

    const resolved = resolveAnchor(anchor);
    expect(resolved.element?.tagName).toBe("BUTTON");
    expect(resolved.element?.getAttribute("aria-label")).toBe("Open menu");
  });

  it("does not drift to a different element when the original is removed and a similar one exists", () => {
    document.body.innerHTML = `
      <ul class="menu">
        <li><a href="/home">Home</a></li>
        <li><a href="/pricing" data-testid="nav-pricing">Pricing</a></li>
        <li><a href="/about">About</a></li>
      </ul>`;
    const anchor = captureAnchor(
      document.querySelector<HTMLElement>('[data-testid="nav-pricing"]')!,
      CLICK,
    );

    // The pricing link is deleted; the others remain.
    document.querySelector('[data-testid="nav-pricing"]')!.closest("li")!.remove();

    const resolved = resolveAnchor(anchor);
    expect(resolved.element).toBeNull();
    expect(resolved.confidence).toBe("lost");
  });
});

describe("anchorPoint", () => {
  it("places the point using the stored intra-element offset", async () => {
    const { anchorPoint } = await import("./resolve.js");
    document.body.innerHTML = `<div id="box">content</div>`;
    const el = document.querySelector<HTMLElement>("#box")!;
    el.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 200, height: 40 }) as DOMRect;

    const anchor = captureAnchor(el, CLICK);
    anchor.offset = { x: 0.25, y: 0.5 };

    const pt = anchorPoint(el, anchor);
    expect(pt).toEqual({ x: 100 + 200 * 0.25, y: 50 + 40 * 0.5 });
  });
});

describe("resolveAnchor — ambiguity", () => {
  it("prefers the text-matching candidate among identical-structure siblings", () => {
    document.body.innerHTML = `
      <div class="grid">
        <article class="tile"><h3>Reports</h3></article>
        <article class="tile"><h3>Settings</h3></article>
        <article class="tile"><h3>Billing</h3></article>
      </div>`;
    const target = document.querySelectorAll<HTMLElement>("article")[1]!;
    const anchor = captureAnchor(target, CLICK);

    // No structural change, but strip the class so selector/path do the work.
    document.querySelectorAll("article").forEach((a) => (a.className = "tile card"));

    const resolved = resolveAnchor(anchor);
    expect(resolved.element?.textContent).toContain("Settings");
  });
});
