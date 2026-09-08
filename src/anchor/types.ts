/**
 * An ElementAnchor is a durable, redundant description of a single DOM element,
 * captured at comment-creation time. None of its fields is trusted on its own:
 * re-anchoring scores every strategy and picks the best-supported candidate.
 */
export interface ElementAnchor {
  /** Schema version, so stored anchors can be migrated. */
  v: 1;

  /**
   * A CSS selector path from the document root, built to be as stable as we can
   * make it (prefers ids and stable-looking attributes, falls back to
   * :nth-of-type). May become stale if the DOM is restructured.
   */
  selector: string;

  /**
   * Structural path: for each ancestor from <body> down to the element, the tag
   * name plus its index among same-tag siblings. Survives class/attr churn.
   */
  path: PathStep[];

  /** id attribute at capture time, if any and if it looked non-generated. */
  id?: string;

  /** Attributes we consider identifying, captured verbatim. */
  attrs: Record<string, string>;

  /** Lowercased tag name, e.g. "button". */
  tag: string;

  /**
   * Trimmed, collapsed text content of the element, capped in length. Used as a
   * tie-breaker and sanity check, never as a primary key.
   */
  text?: string;

  /**
   * Normalized position of the anchor point *within* the element's box, 0..1 on
   * each axis. Lets the pin sit where the user actually clicked (e.g. the corner
   * of an image) rather than always at the element's origin.
   */
  offset: { x: number; y: number };

  /** Absolute document coords at capture time. Last-resort fallback only. */
  viewport: { x: number; y: number; scrollX: number; scrollY: number };
}

export interface PathStep {
  tag: string;
  /** 1-based index among siblings sharing the same tag. */
  index: number;
}

export type AnchorConfidence = "exact" | "high" | "medium" | "low" | "lost";

export interface ResolvedAnchor {
  element: HTMLElement | null;
  confidence: AnchorConfidence;
  /** Which strategy won, for debugging / telemetry. */
  strategy: string;
  /** 0..1 blended score of the winning candidate. */
  score: number;
}
