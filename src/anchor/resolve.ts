/**
 * Resolve: given a stored ElementAnchor, find the element it most likely refers
 * to in the current DOM.
 *
 * Strategy: gather a small set of candidate elements from independent lookups
 * (selector, id, test attributes, structural path), then score each candidate on
 * how well it matches *all* the anchor's evidence. Highest score wins, provided
 * it clears a floor. This makes the system robust to any single strategy going
 * stale — a class rename, an id change, a wrapper div — as long as the others
 * still corroborate.
 */
import type { AnchorConfidence, ElementAnchor, ResolvedAnchor } from "./types.js";
import {
  cssEscape,
  IDENTIFYING_ATTRS,
  indexAmongTag,
  isConnectedElement,
  normalizeText,
  tagName,
} from "./dom-utils.js";
import { resolveSelector } from "./selector.js";

interface Candidate {
  el: HTMLElement;
  /** Strategies that surfaced this candidate. */
  sources: Set<string>;
}

/**
 * Weights for each piece of evidence when scoring a candidate. These don't sum
 * to 1: a strong match on any *one* durable signal (a live selector, a matching
 * test id, or an exact structural path + tag) should on its own clear the
 * acceptance threshold, because in practice that's often all that survives a
 * redeploy. Corroboration between signals then pushes confidence toward "exact".
 */
const W = {
  selector: 0.34,
  id: 0.22,
  testAttr: 0.3,
  otherAttrs: 0.12,
  tag: 0.06,
  path: 0.24,
  /** Extra credit when the structural path lines up step-for-step. */
  pathExact: 0.1,
  text: 0.16,
  /** Extra credit when the text is long enough to be genuinely identifying. */
  textDistinctive: 0.08,
} as const;

/** Text at least this long is treated as a distinctive identifier. */
const DISTINCTIVE_TEXT_LEN = 12;

const TEST_ATTRS = new Set([
  "data-testid",
  "data-test",
  "data-test-id",
  "data-qa",
  "data-cy",
  "data-poke-id",
]);

function addCandidate(map: Map<HTMLElement, Candidate>, el: unknown, source: string): void {
  if (!isConnectedElement(el)) return;
  const existing = map.get(el);
  if (existing) existing.sources.add(source);
  else map.set(el, { el, sources: new Set([source]) });
}

function gatherCandidates(anchor: ElementAnchor): Map<HTMLElement, Candidate> {
  const map = new Map<HTMLElement, Candidate>();

  // 1. The stored selector.
  addCandidate(map, resolveSelector(anchor.selector), "selector");

  // 2. id lookup.
  if (anchor.id) {
    try {
      addCandidate(map, document.getElementById(anchor.id), "id");
    } catch {
      /* invalid id string */
    }
  }

  // 3. Each identifying attribute value, tag-scoped.
  for (const attr of IDENTIFYING_ATTRS) {
    const val = anchor.attrs[attr];
    if (!val) continue;
    try {
      const sel = `${anchor.tag}[${attr}="${cssEscape(val)}"]`;
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        addCandidate(map, el, TEST_ATTRS.has(attr) ? "testAttr" : "attr");
      });
    } catch {
      /* ignore bad selector */
    }
  }

  // 4. Structural path from <body> down.
  const byPath = resolveByPath(anchor);
  if (byPath) addCandidate(map, byPath, "path");

  // 5. Text content match, tag-scoped, only if the text is distinctive enough.
  if (anchor.text && anchor.text.length >= 3) {
    const wanted = anchor.text;
    const tags = anchor.tag ? [anchor.tag] : [];
    for (const t of tags) {
      let count = 0;
      for (const el of Array.from(document.getElementsByTagName(t))) {
        if (count > 50) break; // don't scan huge lists
        count++;
        if (normalizeText(el) === wanted) {
          addCandidate(map, el as HTMLElement, "text");
        }
      }
    }
  }

  return map;
}

/** Walk the stored tag+index path from the document body. */
function resolveByPath(anchor: ElementAnchor): HTMLElement | null {
  const steps = anchor.path;
  if (!steps.length) return null;

  // The first step is <body> (or the root). Start there.
  let cur: Element | null = document.body ?? document.documentElement;
  // Skip the first step if it names the element we're standing on.
  const start = steps[0] && (steps[0].tag === "body" || steps[0].tag === "html") ? 1 : 0;

  for (let i = start; i < steps.length; i++) {
    const step = steps[i]!;
    if (!cur) return null;
    const sameTag: Element[] = Array.from(cur.children).filter(
      (c) => c.tagName.toLowerCase() === step.tag,
    );
    cur = sameTag[step.index - 1] ?? null;
  }
  return isConnectedElement(cur) ? cur : null;
}

function scoreCandidate(el: HTMLElement, anchor: ElementAnchor, sources: Set<string>): number {
  let score = 0;

  if (sources.has("selector")) score += W.selector;

  if (anchor.id && el.id === anchor.id) score += W.id;

  // Identifying attributes: test attrs weigh more than generic ones.
  let testHits = 0;
  let testTotal = 0;
  let otherHits = 0;
  let otherTotal = 0;
  let testContradiction = false;
  for (const attr of IDENTIFYING_ATTRS) {
    const want = anchor.attrs[attr];
    if (!want) continue;
    const got = el.getAttribute(attr);
    if (TEST_ATTRS.has(attr)) {
      testTotal++;
      if (got === want) testHits++;
      // A *different* test id value is a contradiction: these are chosen to be
      // unique and stable, so a mismatch means this isn't our element.
      else if (got) testContradiction = true;
    } else {
      otherTotal++;
      if (got === want) otherHits++;
    }
  }
  if (testTotal) score += W.testAttr * (testHits / testTotal);
  if (otherTotal) score += W.otherAttrs * (otherHits / otherTotal);
  if (testContradiction) score -= W.testAttr;

  const tagMatch = tagName(el) === anchor.tag;
  if (tagMatch) score += W.tag;

  // Structural path similarity: fraction of trailing steps that line up. A
  // step-for-step match, with the tag also matching, is strong evidence.
  const pathSim = pathSimilarity(el, anchor);
  score += W.path * pathSim;
  if (pathSim >= 0.999 && tagMatch) score += W.pathExact;

  // Text: exact match is full credit, prefix/containment is partial. Long text
  // is genuinely identifying, so it earns a bonus on an exact match — and a
  // clear mismatch is evidence *against* this candidate, not just absence of
  // evidence for it. Without that penalty, a positionally-identical element
  // left behind after the real target is deleted would be accepted.
  if (anchor.text) {
    const got = normalizeText(el);
    if (got === anchor.text) {
      score += W.text;
      if (anchor.text.length >= DISTINCTIVE_TEXT_LEN) score += W.textDistinctive;
    } else if (got && (got.startsWith(anchor.text) || anchor.text.startsWith(got))) {
      score += W.text * 0.5;
    } else if (got) {
      score -= W.text; // had text, and it's different — contradiction
    }
  }

  // Small bonus for corroboration across independent strategies.
  const independent = new Set(
    [...sources].map((s) => (s === "attr" ? "otherAttr" : s)),
  );
  if (independent.size >= 3) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

/** Compare the candidate's ancestor tag/index chain to the stored one. */
function pathSimilarity(el: HTMLElement, anchor: ElementAnchor): number {
  const want = anchor.path;
  if (!want.length) return 0;

  const got: { tag: string; index: number }[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1) {
    got.unshift({ tag: tagName(cur), index: indexAmongTag(cur) });
    if (cur === document.body || cur === document.documentElement) break;
    cur = cur.parentElement;
  }

  // Align from the deepest element backwards; count matching steps.
  let matches = 0;
  const len = Math.min(want.length, got.length);
  for (let i = 1; i <= len; i++) {
    const a = want[want.length - i]!;
    const b = got[got.length - i]!;
    if (a.tag === b.tag && a.index === b.index) matches++;
    else if (a.tag === b.tag) matches += 0.4;
    else break;
  }
  return matches / want.length;
}

function confidenceFor(score: number): AnchorConfidence {
  if (score >= 0.92) return "exact";
  if (score >= 0.7) return "high";
  if (score >= 0.5) return "medium";
  if (score >= 0.32) return "low";
  return "lost";
}

export interface ResolveOptions {
  /** Minimum blended score to accept a candidate. Default 0.32. */
  threshold?: number;
}

export function resolveAnchor(
  anchor: ElementAnchor,
  options: ResolveOptions = {},
): ResolvedAnchor {
  const threshold = options.threshold ?? 0.32;
  const candidates = gatherCandidates(anchor);

  if (candidates.size === 0) {
    return { element: null, confidence: "lost", strategy: "none", score: 0 };
  }

  let best: { el: HTMLElement; score: number; sources: Set<string> } | null = null;
  for (const { el, sources } of candidates.values()) {
    const score = scoreCandidate(el, anchor, sources);
    if (!best || score > best.score) best = { el, score, sources };
  }

  if (!best || best.score < threshold) {
    return {
      element: null,
      confidence: "lost",
      strategy: best ? [...best.sources].join("+") : "none",
      score: best?.score ?? 0,
    };
  }

  return {
    element: best.el,
    confidence: confidenceFor(best.score),
    strategy: [...best.sources].join("+"),
    score: Number(best.score.toFixed(3)),
  };
}

/**
 * Given a resolved element and the anchor's stored intra-element offset, compute
 * the absolute document coordinates where the pin should be drawn.
 */
export function anchorPoint(
  el: HTMLElement,
  anchor: ElementAnchor,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX + rect.width * anchor.offset.x,
    y: rect.top + window.scrollY + rect.height * anchor.offset.y,
  };
}
