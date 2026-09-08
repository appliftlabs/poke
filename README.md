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

Early but usable. Working today:

- **Anchoring engine** — pins stay on the right element across reloads and
  layout changes (details below).
- **Comment layer** — `Poke.init()` mounts an isolated overlay: comment mode
  with a hover highlight, click-to-pin, threaded replies, resolve/reopen,
  delete, and a sidebar listing every comment. Rendered with Preact inside a
  Shadow DOM so it can't collide with the host page's styles or scripts.
- **Identity** — pass a `user` if your app has accounts; otherwise Poke asks for
  a name the first time someone comments and remembers it in that browser. The
  name shows next to their comments for everyone.
- **Storage** — storage-agnostic core with two bundled adapters:
  `LocalStorageAdapter` (zero infra, single browser) and `HttpAdapter`
  (persists to any REST backend, with SSE realtime for multi-user). A small
  Postgres-backed reference server lives in [`server/`](server/). Or implement
  `StorageAdapter` against Firebase, Supabase, your own API.

Next: keyboard nav, screenshots attached to comments.

## Quick start

```bash
npm install @applift/poke
```

```js
import { init } from "@applift/poke";

// App with accounts — tell Poke who's here:
init({ user: { id: currentUser.id, name: currentUser.name } });

// Shared review link, no accounts — omit `user`. Poke asks for a name the
// first time someone comments and remembers it in that browser:
init();

// (no `adapter` → localStorage. Pass `adapter` to sync your own backend.)
```

Nothing else to install — Preact is bundled in, and Poke renders into its own
Shadow DOM, so it won't touch your app's React/Preact/styles.

### Identity

| You pass | Author of comments | Name prompt |
|---|---|---|
| `user: { id, name }` | that user | never |
| `user: { name: "Sam" }` | browser-local id, name pre-filled to "Sam" | never |
| nothing | browser-local id | on first comment; then remembered |

When Poke manages identity, `init()` returns an `identity` handle
(`identity.name`, `identity.isNamed`, `identity.setName(...)`) if you'd rather
drive the name yourself. The name and a stable anonymous id live in
`localStorage` under `poke:identity`. This is not authentication — anyone can
type any name — but it's the right weight for "a client opens a link and leaves
feedback".

Or the script tag, no build step at all:

```html
<script
  src="https://unpkg.com/@applift/poke/dist/poke.global.js"
  data-poke-user-id="u_12"
  data-poke-user-name="Ada Lovelace"
></script>
```

### Persisting to a database

Use `HttpAdapter` against a backend that speaks Poke's small REST contract:

```ts
import { init, HttpAdapter } from "@applift/poke";

init({
  user: { id: me.id, name: me.name },
  adapter: new HttpAdapter({
    baseUrl: "https://api.example.com/poke",
    headers: () => ({ Authorization: `Bearer ${getToken()}` }),
    // realtime is automatic if the backend exposes an SSE stream at
    // {baseUrl}/pages/:pageId/events — pass `sseUrl: null` to opt out
  }),
});
```

There's a Postgres-backed reference backend in [`server/`](server/) with SSE
realtime — deploy it as-is for a trusted audience, or fork it to add auth:

```bash
cd server && npm install
docker compose up -d                    # or bring your own Postgres
DATABASE_URL=postgres://poke:poke@localhost:5432/poke npm run migrate
node --env-file=.env src/server.js       # :4000
```

The REST contract it implements:

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/pages/:pageId/threads` | — | `PokeThread[]` |
| `POST` | `/threads` | `PokeThread` | `201` |
| `POST` | `/threads/:id/messages` | `{ body, author }` | `PokeMessage` |
| `PATCH` | `/threads/:id` | `{ status }` | `200` |
| `PATCH` | `/messages/:id` | `{ body }` | `200` |
| `DELETE` | `/threads/:id` | — | `204` |
| `GET` | `/pages/:pageId/events` | — | SSE stream (optional) |

### Writing a fully custom adapter

Implement the six methods (all may be async) plus an optional `subscribe()`:

```ts
import type { StorageAdapter } from "@applift/poke";

class FirebaseAdapter implements StorageAdapter {
  listThreads(pageId) { /* query */ }
  createThread(thread) { /* write */ }
  addMessage({ threadId, body, author }) { /* append, return the new PokeMessage */ }
  updateThread(id, patch) { /* patch { status } */ }
  updateMessage(id, body) { /* patch body */ }
  deleteThread(id) { /* delete */ }
  subscribe(pageId, listener) {
    // call listener({ type: "reload" }) on any remote change; return unsub
  }
}
```

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
npm run build     # dist/ — ESM, CJS, and a script-tag IIFE bundle

# Try it: build, then serve and open examples/demo.html
npx serve .
```

`examples/demo.html` is the full comment layer on a sample page.
`examples/anchor-playground.html` is a focused "shuffle the DOM and re-anchor"
harness for the engine alone.

## License

MIT © Applift Labs
