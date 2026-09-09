/** node --test src/cors.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOriginRules, matchOrigin } from "./cors.js";

test("exact origins", () => {
  const r = buildOriginRules("https://app.example.com,https://staging.example.com");
  assert.equal(matchOrigin(r, "https://app.example.com"), "https://app.example.com");
  assert.equal(matchOrigin(r, "https://other.example.com"), "");
  assert.equal(matchOrigin(r, ""), "");
});

test("wildcard subdomain", () => {
  const r = buildOriginRules("https://*.modools.app,https://modools.app");
  assert.equal(
    matchOrigin(r, "https://testinstitution.modools.app"),
    "https://testinstitution.modools.app",
  );
  assert.equal(matchOrigin(r, "https://modools.app"), "https://modools.app");
  assert.equal(matchOrigin(r, "https://a.b.modools.app"), ""); // two labels
  assert.equal(matchOrigin(r, "http://x.modools.app"), ""); // scheme
  assert.equal(matchOrigin(r, "https://modools.app.evil.com"), "");
  assert.equal(matchOrigin(r, "https://evil.com"), "");
});

test("star allows anything", () => {
  const r = buildOriginRules("*");
  assert.equal(matchOrigin(r, "https://anything.dev"), "*");
});

test("default (unset) is star", () => {
  const r = buildOriginRules(undefined);
  assert.equal(matchOrigin(r, "https://x.dev"), "*");
});

test("port-specific origins (local dev)", () => {
  const r = buildOriginRules("http://localhost:3000");
  assert.equal(matchOrigin(r, "http://localhost:3000"), "http://localhost:3000");
  assert.equal(matchOrigin(r, "http://localhost:3001"), "");
});
