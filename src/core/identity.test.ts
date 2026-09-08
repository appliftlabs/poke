import { beforeEach, describe, expect, it } from "vitest";
import { LocalIdentity } from "./identity.js";

beforeEach(() => {
  window.localStorage.clear();
});

describe("LocalIdentity", () => {
  it("creates a stable anonymous id on first use and persists it", () => {
    const a = new LocalIdentity();
    expect(a.id).toMatch(/^anon_/);
    expect(a.isNamed).toBe(false);
    expect(a.user.name).toBe("Anonymous");

    // A fresh instance in the same browser reads the same id.
    const b = new LocalIdentity();
    expect(b.id).toBe(a.id);
  });

  it("remembers a name across instances", () => {
    const a = new LocalIdentity();
    a.setName("Sam Rivera");
    expect(a.isNamed).toBe(true);
    expect(a.user.name).toBe("Sam Rivera");

    const b = new LocalIdentity();
    expect(b.name).toBe("Sam Rivera");
    expect(b.user).toEqual(a.user);
  });

  it("keeps a stable colour for the id", () => {
    const a = new LocalIdentity();
    const c1 = a.user.color;
    a.setName("Whoever");
    expect(a.user.color).toBe(c1);
  });

  it("trims and length-caps names", () => {
    const a = new LocalIdentity();
    a.setName("  Grace   ");
    expect(a.name).toBe("Grace");
    a.setName("x".repeat(200));
    expect(a.name).toHaveLength(60);
  });

  it("seeds from initialName but doesn't overwrite an existing name", () => {
    const first = new LocalIdentity({ initialName: "From URL" });
    expect(first.name).toBe("From URL");

    first.setName("Chosen");
    const later = new LocalIdentity({ initialName: "From URL" });
    expect(later.name).toBe("Chosen");
  });

  it("forceName overrides a stored name (host asserts identity every load)", () => {
    const a = new LocalIdentity();
    a.setName("Old");

    const b = new LocalIdentity({ forceName: "Authoritative" });
    expect(b.name).toBe("Authoritative");
    // and it persisted
    expect(new LocalIdentity().name).toBe("Authoritative");
  });

  it("works with an injected backend (no localStorage)", () => {
    let store: unknown = null;
    const backend = {
      read: () => store as never,
      write: (v: unknown) => {
        store = v;
      },
    };
    const a = new LocalIdentity({ backend });
    a.setName("Mem");
    expect(new LocalIdentity({ backend }).name).toBe("Mem");
  });

  it("survives corrupt stored JSON", () => {
    window.localStorage.setItem("poke:identity", "{broken");
    const a = new LocalIdentity();
    expect(a.id).toMatch(/^anon_/);
  });
});
