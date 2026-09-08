/**
 * Builds a CSS selector path for an element, preferring stable hooks (ids,
 * test attributes, stable classes) and falling back to :nth-of-type. The goal is
 * a selector that still resolves after a rebuild, not the shortest possible one.
 */
import {
  cssEscape,
  IDENTIFYING_ATTRS,
  indexAmongTag,
  isStableClass,
  isStableId,
  tagName,
} from "./dom-utils.js";

/** Attributes worth putting into a selector (subset of IDENTIFYING_ATTRS). */
const SELECTOR_ATTRS = [
  "data-testid",
  "data-test",
  "data-test-id",
  "data-qa",
  "data-cy",
  "data-poke-id",
  "name",
  "role",
  "type",
] as const;

function stableClasses(el: Element): string[] {
  return Array.from(el.classList).filter(isStableClass).slice(0, 2);
}

/** A selector segment that identifies `el` among its siblings, if we can. */
function segmentFor(el: Element, { withNthFallback }: { withNthFallback: boolean }): string {
  const tag = tagName(el);

  const id = el.getAttribute("id");
  if (id && isStableId(id) && isUnique(`#${cssEscape(id)}`, el)) {
    return `#${cssEscape(id)}`;
  }

  for (const attr of SELECTOR_ATTRS) {
    const val = el.getAttribute(attr);
    if (!val) continue;
    const sel = `${tag}[${attr}="${cssEscape(val)}"]`;
    if (isUnique(sel, el, el.parentElement)) return sel;
  }

  const classes = stableClasses(el);
  if (classes.length) {
    const sel = `${tag}${classes.map((c) => `.${cssEscape(c)}`).join("")}`;
    if (isUnique(sel, el, el.parentElement)) return sel;
  }

  if (withNthFallback) {
    return `${tag}:nth-of-type(${indexAmongTag(el)})`;
  }
  return tag;
}

function isUnique(selector: string, el: Element, within?: Element | null): boolean {
  try {
    const scope = within ?? document;
    const matches = scope.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}

/**
 * Build a full path selector. Walks up from `el`, stopping early if it hits an
 * element with a document-unique segment (id or test attr).
 */
export function buildSelector(el: Element): string {
  const segments: string[] = [];
  let cur: Element | null = el;

  while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
    const seg = segmentFor(cur, { withNthFallback: true });
    segments.unshift(seg);

    // If this segment is already document-unique, we don't need ancestors.
    if (isUnique(segments.join(" > "), el)) break;
    if (cur === document.body) break;
    cur = cur.parentElement;
  }

  return segments.join(" > ");
}

/** Resolve a selector to a single element, or null if it's stale/ambiguous. */
export function resolveSelector(selector: string): HTMLElement | null {
  if (!selector) return null;
  try {
    const matches = document.querySelectorAll<HTMLElement>(selector);
    return matches.length === 1 ? matches[0]! : null;
  } catch {
    return null;
  }
}

export { IDENTIFYING_ATTRS };
