export type {
  ElementAnchor,
  PathStep,
  ResolvedAnchor,
  AnchorConfidence,
} from "./types.js";
export { captureAnchor, type CapturePoint } from "./capture.js";
export {
  resolveAnchor,
  anchorPoint,
  type ResolveOptions,
} from "./resolve.js";
export { buildSelector, resolveSelector } from "./selector.js";
