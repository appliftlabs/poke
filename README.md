# Poke

**Figma-style pinned comments for any live web page.**

Drop Poke into a site and anyone — a client, a teammate, a QA tester — can flip
on comment mode, click the thing they're talking about, and leave a note pinned
right there. Like leaving a comment on a Figma design, but on your actual running
website.

No more "the button, you know, the blue one, near the top" or screenshots with
arrows scribbled on them. The note sits on the element.

Poke is an open-source contribution from [Applift Labs](https://applift.xyz).
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
- **Storage** — `localStorage` by default (single browser), or a real backend
  for multi-user: a bundled `HttpAdapter` + the Postgres server in
  [`server/`](https://github.com/yusuf-ishaku/poke/tree/main/server), or your own `StorageAdapter`. See
  [How it works](#how-it-works--the-two-pieces).

Next: keyboard nav, screenshots attached to comments, a one-click server deploy.

## How it works — the two pieces

Poke has a **client library** and (for teams) a **backend**.

1. **`@appliftlabs/poke`** — the client. A script in the browser: the pins, the
   comment UI, the element-anchoring. You add this to your app. This is all you
   need if comments only have to persist in *one* person's browser (solo review,
   a quick demo) — it uses `localStorage` by default, no backend.

2. **A backend** — needed the moment *two people* need to see each other's
   comments, because the browser can't (and shouldn't) talk to a database
   directly. The client sends comments to a small server over HTTP; the server
   owns the database and pushes changes to everyone viewing the page.

   Poke ships one: [`server/`](https://github.com/yusuf-ishaku/poke/tree/main/server) — Postgres-backed, ~350 lines, one
   dependency. **You run your own copy** (Railway, Fly, Docker, a VPS — see
   [`server/README.md`](https://github.com/yusuf-ishaku/poke/blob/main/server/README.md)). Every team self-hosts their own; there
   is no shared "Poke" service. Or write a
   [`StorageAdapter`](#writing-a-custom-adapter-supabase-firebase-your-own-api)
   against Supabase, Firebase, or your existing API instead.

So: **client always. Backend once, when you go multi-user.**

## Quick start

```bash
npm install @appliftlabs/poke
```

```js
import { init } from "@appliftlabs/poke";

// App with accounts — tell Poke who's here:
init({ user: { id: currentUser.id, name: currentUser.name } });

// Shared review link, no accounts — omit `user`. Poke asks for a name the
// first time someone comments and remembers it in that browser:
init();

// (no `adapter` → localStorage. Pass `adapter` to sync your own backend.)
```

Nothing else to install — Preact is bundled in, and Poke renders into its own
Shadow DOM, so it won't touch your app's React/Preact/styles.

`init()` returns a handle: `{ store, identity, mount, unmount, destroy }`. Call
`destroy()` on teardown (framework unmount, HMR).

### Framework setup

Poke touches `window`/`document`, so it must run in the browser only. Runnable
versions of each of these are in [`examples/frameworks/`](https://github.com/yusuf-ishaku/poke/tree/main/examples/frameworks).

<details>
<summary><b>Vanilla / plain HTML</b></summary>

```html
<script type="module">
  import { init } from "https://unpkg.com/@appliftlabs/poke/dist/index.js";
  init({ pageId: location.pathname });
</script>
```

or the no-bundler script tag:

```html
<script
  src="https://unpkg.com/@appliftlabs/poke/dist/poke.global.js"
  data-poke-user-id="u_12"
  data-poke-user-name="Ada Lovelace"
></script>
```
</details>

<details>
<summary><b>React</b> (Vite, CRA, etc.)</summary>

```tsx
// Poke.tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom"; // or your router's equivalent

export function Poke() {
  const { pathname } = useLocation();

  useEffect(() => {
    let poke: { destroy(): void } | undefined;
    let cancelled = false;
    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      if (cancelled) return;
      poke = init({
        pageId: pathname,
        adapter: new HttpAdapter({ baseUrl: import.meta.env.VITE_POKE_URL }),
      });
    });
    return () => { cancelled = true; poke?.destroy(); };
  }, [pathname]); // re-init on route change so comments scope per page
  return null;
}
```

Render `<Poke />` once, near the root (in `App`). No router? Pass a stable
`pageId` string yourself, or drop the dep and use `window.location.pathname`
for a single-page app.
</details>

<details>
<summary><b>Next.js</b></summary>

**App Router** — `app/layout.tsx` is a Server Component, so use a client child.
Key detail: re-run on route change so comments scope per page.

```tsx
// app/poke.tsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function Poke() {
  const pathname = usePathname();

  useEffect(() => {
    let poke: { destroy(): void } | undefined;
    let cancelled = false;

    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      if (cancelled) return;
      poke = init({
        pageId: pathname, // NOT window.location.pathname — that won't update
        adapter: new HttpAdapter({ baseUrl: process.env.NEXT_PUBLIC_POKE_URL! }),
      });
    });

    return () => {
      cancelled = true;
      poke?.destroy();
    };
  }, [pathname]); // re-init when the route changes

  return null;
}
```

```tsx
// app/layout.tsx
import { Poke } from "./poke";
export default function RootLayout({ children }) {
  return (
    <html><body>{children}<Poke /></body></html>
  );
}
```

**Pages Router** — same idea in `pages/_app.tsx`, keyed on `router.pathname`:

```tsx
import { useEffect } from "react";
import { useRouter } from "next/router";

// inside App({ Component, pageProps })
const router = useRouter();
useEffect(() => {
  let poke: { destroy(): void } | undefined;
  let cancelled = false;
  import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
    if (cancelled) return;
    poke = init({
      pageId: router.pathname,
      adapter: new HttpAdapter({ baseUrl: process.env.NEXT_PUBLIC_POKE_URL! }),
    });
  });
  return () => { cancelled = true; poke?.destroy(); };
}, [router.pathname]);
```

The dynamic `import()` inside `useEffect` keeps Poke out of the server bundle;
the `cancelled` guard stops a stale instance mounting if you navigate again
before the import resolves.

> **`window.location.pathname` with `[]` deps is the #1 mistake** — it captures
> the first route and never updates, so every page shows the same comments. Use
> the reactive `usePathname()` / `router.pathname` and depend on it.
</details>

<details>
<summary><b>Vue 3</b></summary>

```ts
// main.ts, after createApp(...).mount(...)
import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
  init({
    pageId: window.location.pathname,
    adapter: new HttpAdapter({ baseUrl: import.meta.env.VITE_POKE_URL }),
  });
});
```

or as a component with `onMounted` / `onUnmounted` calling `init()` / `destroy()`.
</details>

<details>
<summary><b>Svelte / SvelteKit</b></summary>

```svelte
<!-- +layout.svelte -->
<script>
  import { onMount } from "svelte";
  onMount(() => {
    let poke;
    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      poke = init({
        pageId: location.pathname,
        adapter: new HttpAdapter({ baseUrl: import.meta.env.VITE_POKE_URL }),
      });
    });
    return () => poke?.destroy();
  });
</script>
```
</details>

**Why the effect re-runs on route change:** `pageId` is fixed for the life of an
`init()` call — Poke doesn't watch the URL itself. Each snippet above keys its
effect on the router's current path, so navigating tears down the old instance
and re-inits with the new `pageId`. That's what scopes comments per page. If you
want one shared comment set across several routes, pass a constant `pageId`
instead.

**The sidebar spans the whole app.** Pins are per-page, but the "☰ All" sidebar
lists every comment across every route (when your backend supports it — the
bundled server and adapters do). Selecting a comment from another route calls
`onNavigate(pageId)` so your router can go there:

```js
init({
  adapter: ...,
  onNavigate: (pageId) => router.push(pageId), // Next: useRouter().push
});
```

Without `onNavigate`, Poke does `location.assign(pageId)` — works if `pageId`
is a real path, but it's a full reload.

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
  src="https://unpkg.com/@appliftlabs/poke/dist/poke.global.js"
  data-poke-user-id="u_12"
  data-poke-user-name="Ada Lovelace"
></script>
```

### Going multi-user

**1. Run the backend.** Deploy your own copy of [`server/`](https://github.com/yusuf-ishaku/poke/tree/main/server) —
full instructions (Railway, Fly, Docker, plain Node) are in
[`server/README.md`](https://github.com/yusuf-ishaku/poke/blob/main/server/README.md). Locally it's:

```bash
cd server && npm install
docker compose up -d                    # or bring your own Postgres
DATABASE_URL=postgres://poke:poke@localhost:5432/poke npm run migrate
node --env-file=.env src/server.js       # http://localhost:4000
```

**2. Point the client at it** with `HttpAdapter`:

```ts
import { init, HttpAdapter } from "@appliftlabs/poke";

init({
  user: { id: me.id, name: me.name },     // or omit for the name prompt
  adapter: new HttpAdapter({
    baseUrl: "https://your-poke-server.example.com",
    headers: () => ({ Authorization: `Bearer ${getToken()}` }), // if your server checks auth
    // realtime is automatic — the adapter subscribes to the SSE stream at
    // {baseUrl}/pages/:pageId/events. Pass `sseUrl: null` to disable.
  }),
});
```

That's it — pins now sync live for everyone on the page.

<details>
<summary>The REST contract <code>server/</code> implements (for a custom backend)</summary>


| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/pages/:pageId/threads` | — | `PokeThread[]` (one page) |
| `GET` | `/threads` | — | `PokeThread[]` (all pages — powers the sidebar) |
| `POST` | `/threads` | `PokeThread` | `201` |
| `POST` | `/threads/:id/messages` | `{ body, author }` | `PokeMessage` |
| `PATCH` | `/threads/:id` | `{ status }` | `200` |
| `PATCH` | `/messages/:id` | `{ body }` | `200` |
| `DELETE` | `/threads/:id` | — | `204` |
| `GET` | `/pages/:pageId/events` | — | SSE stream (optional) |
| `GET` | `/pages/*/events` | — | SSE stream for *any* page (sidebar realtime) |

`GET /threads` and the `*` event channel are optional — an adapter that omits
`listAllThreads` just shows the current page in the sidebar.

</details>

### Writing a custom adapter (Supabase, Firebase, your own API)

Instead of running `server/`, implement `StorageAdapter` — the six methods (all
may be async) plus an optional `subscribe()` for realtime:

```ts
import type { StorageAdapter } from "@appliftlabs/poke";

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
import { captureAnchor, resolveAnchor, anchorPoint } from "@appliftlabs/poke";

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
