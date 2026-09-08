# Poke

**Figma-style pinned comments for any live web page.**

Drop Poke into a site and anyone — a client, a teammate, a QA tester — can flip
on comment mode, click the thing they're talking about, and leave a note pinned
right there. Like leaving a comment on a Figma design, but on your actual running
website.

No more "the button, you know, the blue one, near the top" or screenshots with
arrows scribbled on them. The note sits on the element.

Poke is an open-source contribution from [Applift Labs](https://appliftlabs.com).
It's the clean, developer-friendly, no-strings version of what paid tools like
BugHerd and Marker.io do. MIT licensed, free for any team.

---

## Status

Early development. The **anchoring engine** — the part that makes a pin stay on
the right element across reloads and layout changes — is built and tested. The
comment-mode UI, pin rendering, and storage adapters are next.

## The hard part: element anchoring

A naive version of this stores `{ x: 320, y: 78 }` and draws a pin there. That
breaks the moment the page reflows, the viewport changes, or content above it
grows. Poke instead remembers *which element* a comment belongs to.

When you drop a pin, Poke captures an **`ElementAnchor`** — a redundant
description of the target element:

- a CSS selector path, built to prefer stable hooks (`id`, `data-testid`, stable
  class names) over hashed/generated ones
- a structural path (`body > main > section > ul > li:3`) that survives class and
  attribute churn
- identifying attributes (`data-testid`, `aria-label`, `href`, `role`, …)
- the element's trimmed text content
- where *within* the element you clicked, as 0–1 fractions, so the pin sits on
  the corner of the image you actually pointed at
- absolute coordinates, as a last-resort fallback

On the next page load, `resolveAnchor()` gathers candidate elements from several
independent lookups and **scores each one** against all the stored evidence. The
best-supported candidate wins, provided it clears a confidence floor. Any single
strategy can go stale — a class rename, a regenerated `id`, a new wrapper `div` —
and the pin still lands, because the others corroborate.

```ts
import { captureAnchor, resolveAnchor, anchorPoint } from "@applift/poke";

// When the user clicks to leave a comment:
const anchor = captureAnchor(clickedElement, { clientX, clientY });
save(comment, anchor); // anchor is plain JSON

// On the next page load, for each stored comment:
const { element, confidence } = resolveAnchor(anchor);
if (element) {
  const { x, y } = anchorPoint(element, anchor); // absolute doc coords for the pin
  drawPin(x, y, comment);
} else {
  // confidence === "lost" — show it in an "unanchored comments" tray instead
}
```

`confidence` is one of `exact | high | medium | low | lost`, so the UI can flag
pins that landed on a shaky match.

## Development

```bash
npm install
npm test          # vitest, jsdom
npm run typecheck
npm run build      # dist/ — ESM, CJS, and a script-tag IIFE bundle
```

## License

MIT © Applift Labs
