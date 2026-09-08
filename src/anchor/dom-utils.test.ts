import { describe, expect, it } from "vitest";
import { isStableClass, isStableId, normalizeText } from "./dom-utils.js";

describe("isStableId", () => {
  it("accepts hand-authored ids", () => {
    expect(isStableId("save-btn")).toBe(true);
    expect(isStableId("main-nav")).toBe(true);
    expect(isStableId("comment-48213")).toBe(true);
  });

  it("rejects framework-generated ids", () => {
    expect(isStableId(":r7:")).toBe(false);
    expect(isStableId("radix-«r1»")).toBe(false);
    expect(isStableId("mui-4823")).toBe(false);
    expect(isStableId("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(false);
    expect(isStableId("a1b2c3d4e5f60718")).toBe(false);
  });
});

describe("isStableClass", () => {
  it("accepts semantic class names", () => {
    expect(isStableClass("btn-primary")).toBe(true);
    expect(isStableClass("card")).toBe(true);
  });

  it("rejects hashed / CSS-module class names", () => {
    expect(isStableClass("css-1a2b3c")).toBe(false);
    expect(isStableClass("_button_x7f2")).toBe(false);
    expect(isStableClass("jsx-1290381")).toBe(false);
    expect(isStableClass("sc-bdfBwQ")).toBe(false);
  });
});

describe("normalizeText", () => {
  it("collapses whitespace and trims", () => {
    const el = document.createElement("div");
    el.innerHTML = "  Hello \n   world  ";
    expect(normalizeText(el)).toBe("Hello world");
  });

  it("returns undefined for empty content", () => {
    expect(normalizeText(document.createElement("span"))).toBeUndefined();
    expect(normalizeText(null)).toBeUndefined();
  });

  it("caps length at 120 chars", () => {
    const el = document.createElement("p");
    el.textContent = "x".repeat(500);
    expect(normalizeText(el)).toHaveLength(120);
  });
});
