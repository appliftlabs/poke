/**
 * Small DOM helpers shared by the capture and resolve paths. Kept dependency-free
 * and defensive so they behave under jsdom and in odd host pages.
 */

/** Attribute names that tend to identify an element across reloads/deploys. */
export const IDENTIFYING_ATTRS = [
  "data-testid",
  "data-test",
  "data-test-id",
  "data-qa",
  "data-cy",
  "data-poke-id",
  "name",
  "aria-label",
  "role",
  "type",
  "href",
  "src",
  "alt",
  "placeholder",
  "title",
] as const;

/** Max characters of text content we store / compare. */
export const MAX_TEXT = 120;

/**
 * Heuristic: does this id look hand-authored (stable) rather than framework-
 * generated (`:r3:`, `radix-«r1»`, `mui-4823`, long hex/uuid blobs)?
 */
export function isStableId(id: string): boolean {
  if (!id || id.length > 64) return false;
  if (/[:«»]/.test(id)) return false; // React useId, Radix, etc.
  if (/^(radix|headlessui|mui|ember|ext-gen|yui)[-_]?/i.test(id)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return false; // uuid
  if (/^[0-9a-f]{16,}$/i.test(id)) return false; // long hex
  // Mostly-digits ids (e.g. "comment-48213") keep their non-digit stem but are
  // treated as weak; callers weight accordingly.
  return true;
}

/**
 * Heuristic: does a class token look stable rather than a hashed CSS-module /
 * atomic class (`css-1a2b3c`, `_button_x7f2`, `jsx-1290381`)?
 */
export function isStableClass(cls: string): boolean {
  if (!cls) return false;
  if (/^(css-|_|jsx-|sc-|emotion-)/i.test(cls)) return false;
  if (/^[a-z0-9]{6,}$/i.test(cls) && /\d/.test(cls) && /[a-z]/i.test(cls)) {
    return false; // looks hashed
  }
  return true;
}

export function normalizeText(node: Element | null): string | undefined {
  if (!node) return undefined;
  const raw = (node.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return undefined;
  return raw.slice(0, MAX_TEXT);
}

export function tagName(el: Element): string {
  return el.tagName.toLowerCase();
}

/** 1-based index of `el` among siblings with the same tag name. */
export function indexAmongTag(el: Element): number {
  let i = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) i++;
    sib = sib.previousElementSibling;
  }
  return i;
}

/** CSS.escape with a manual fallback for environments that lack it. */
export function cssEscape(value: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  if (g.CSS?.escape) return g.CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

/** All ancestors of `el` from <body> (or root) down to `el` itself. */
export function ancestorChain(el: Element): Element[] {
  const chain: Element[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1) {
    chain.unshift(cur);
    if (cur === document.body || cur === document.documentElement) break;
    cur = cur.parentElement;
  }
  return chain;
}

export function isConnectedElement(el: unknown): el is HTMLElement {
  return (
    !!el &&
    typeof el === "object" &&
    "nodeType" in (el as Node) &&
    (el as Node).nodeType === 1 &&
    (el as Node).isConnected
  );
}
