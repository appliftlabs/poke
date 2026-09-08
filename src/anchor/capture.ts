/**
 * Capture: turn a live element (plus the exact click point) into a durable
 * ElementAnchor that can be stored and later re-resolved.
 */
import type { ElementAnchor, PathStep } from "./types.js";
import {
  ancestorChain,
  IDENTIFYING_ATTRS,
  indexAmongTag,
  isStableId,
  normalizeText,
  tagName,
} from "./dom-utils.js";
import { buildSelector } from "./selector.js";

export interface CapturePoint {
  /** Client coordinates of the user's click (as from a PointerEvent). */
  clientX: number;
  clientY: number;
}

function collectAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of IDENTIFYING_ATTRS) {
    const val = el.getAttribute(name);
    if (val != null && val !== "") out[name] = val;
  }
  return out;
}

function buildPath(el: Element): PathStep[] {
  return ancestorChain(el).map((node) => ({
    tag: tagName(node),
    index: indexAmongTag(node),
  }));
}

/**
 * Compute where, inside the element's box, the click landed — as 0..1 fractions.
 * Clamped, and defaulting to the centre when the box has no size (jsdom, hidden).
 */
function computeOffset(el: Element, point: CapturePoint): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0.5, y: 0.5 };
  const x = (point.clientX - rect.left) / rect.width;
  const y = (point.clientY - rect.top) / rect.height;
  return { x: clamp01(x), y: clamp01(y) };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function captureAnchor(el: HTMLElement, point: CapturePoint): ElementAnchor {
  const rect = el.getBoundingClientRect();
  const id = el.getAttribute("id");

  const anchor: ElementAnchor = {
    v: 1,
    selector: buildSelector(el),
    path: buildPath(el),
    attrs: collectAttrs(el),
    tag: tagName(el),
    offset: computeOffset(el, point),
    viewport: {
      x: rect.left + window.scrollX + rect.width * 0.5,
      y: rect.top + window.scrollY + rect.height * 0.5,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
  };

  if (id && isStableId(id)) anchor.id = id;

  const text = normalizeText(el);
  if (text) anchor.text = text;

  return anchor;
}
