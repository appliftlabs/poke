import { describe, expect, it } from "vitest";
import { buildOriginRules, matchOrigin } from "./cors.js";

describe("server/cors", () => {
  it("matches exact origins", () => {
    const r = buildOriginRules("https://app.example.com,https://staging.example.com");
    expect(matchOrigin(r, "https://app.example.com")).toBe("https://app.example.com");
    expect(matchOrigin(r, "https://other.example.com")).toBe("");
    expect(matchOrigin(r, null)).toBe("");
  });

  it("matches a single wildcard subdomain label, scheme-sensitive", () => {
    const r = buildOriginRules("https://*.modools.app,https://modools.app");
    expect(matchOrigin(r, "https://testinstitution.modools.app")).toBe(
      "https://testinstitution.modools.app",
    );
    expect(matchOrigin(r, "https://modools.app")).toBe("https://modools.app");
    expect(matchOrigin(r, "https://a.b.modools.app")).toBe(""); // two labels
    expect(matchOrigin(r, "http://x.modools.app")).toBe(""); // wrong scheme
    expect(matchOrigin(r, "https://modools.app.evil.com")).toBe("");
  });

  it("* allows anything", () => {
    expect(matchOrigin(buildOriginRules("*"), "https://anything.dev")).toBe("*");
    expect(matchOrigin(buildOriginRules(undefined), "https://x.dev")).toBe("*");
  });

  it("accepts an array of origins", () => {
    const r = buildOriginRules(["https://a.dev", "https://b.dev"]);
    expect(matchOrigin(r, "https://a.dev")).toBe("https://a.dev");
    expect(matchOrigin(r, "https://c.dev")).toBe("");
  });
});
