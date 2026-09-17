# Poke

**Figma-style pinned comments for any live web page.**

Click something, leave a note, it stays pinned to that exact element — even
after the page reloads or the layout shifts. No more "the button, you know,
the blue one, near the top." Open source, MIT licensed, from
[Applift Labs](https://applift.xyz).

```bash
npm install @appliftlabs/poke
```

## Quick start: comments backed by your own database

The fastest path to real, multi-user comments is running Poke's API as a route
inside the backend you already have — no separate service, no second
database.

```ts
// app/api/poke/[...poke]/route.ts  (Next.js App Router)
import { createPoke } from "@appliftlabs/poke/server";
import { toNextJsHandler } from "@appliftlabs/poke/next-js";
import { Pool } from "pg";

const poke = createPoke({
  database: new Pool({ connectionString: process.env.DATABASE_URL }), // your existing pool
  getUser: async () => {
    const session = await auth(); // your existing auth
    return session && { id: session.user.id, name: session.user.name };
  },
});

export const { GET, POST, PATCH, DELETE } = toNextJsHandler(poke.handler);
```

```tsx
// app/poke.tsx — the client half, mounted once near your app root
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function Poke() {
  const pathname = usePathname();
  useEffect(() => {
    let instance: { destroy(): void } | undefined;
    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      instance = init({
        enabled: process.env.NODE_ENV !== "production", // never ships to real users
        pageId: pathname,
        adapter: new HttpAdapter({ baseUrl: "/api/poke" }),
      });
    });
    return () => instance?.destroy();
  }, [pathname]);
  return null;
}
```

That's a whole team commenting live on your app, stored in Postgres you
already run. `createPoke` needs `pg` (`npm i pg`) — a peer dependency, not
bundled, so it uses your own driver. The schema creates itself on first
request.

**Not Next.js?** Same `createPoke()`, a different one-line mount:

```ts
import { createServer } from "node:http";
import { createPoke } from "@appliftlabs/poke/server";
import { toNodeHandler } from "@appliftlabs/poke/node";
import { Pool } from "pg";

const poke = createPoke({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
});
createServer(toNodeHandler(poke.handler)).listen(4000);
```

**Not Node at all, or want it fully isolated from your app?** See
[Standalone server](#standalone-server-non-nodejs-backends) below.

**Other frameworks** (React, Vue, Svelte, plain HTML) — the client-side half
above is nearly identical everywhere; see
[`examples/frameworks/`](https://github.com/yusuf-ishaku/poke/tree/main/examples/frameworks)
for a complete file per stack.

## Or skip the backend entirely

No `adapter`, no server, nothing to deploy — comments save to `localStorage`
in that one browser. Good for a solo pass over your own app before you wire up
the real thing.

```js
import { init } from "@appliftlabs/poke";

init({
  enabled: process.env.NODE_ENV !== "production",
  user: { id: currentUser.id, name: currentUser.name }, // or omit for a name prompt
});
```

Preact is bundled in and Poke renders into its own Shadow DOM, so this is the
entire install — nothing else to add, nothing of yours it can collide with.

`init()` returns `{ store, identity, mount, unmount, destroy }`. Call
`destroy()` on teardown.

## How it works

**The client** (`@appliftlabs/poke`) is the part that runs in the browser: a
comment-mode toggle, click-to-pin, threaded replies, resolve/reopen, and a
sidebar listing every comment across your whole app. It always runs, whether
or not you've set up a backend.

**A backend** is only needed once two people need to see each other's
comments — the browser can't safely talk to a database on its own. Three ways
to get one, in order of how little you have to do:

1. **`createPoke()` inside your app** (above) — the default recommendation.
2. **[Standalone server](#standalone-server-non-nodejs-backends)** — a small
   Postgres-backed server you deploy separately.
3. **Your own `StorageAdapter`** — implement six methods against Supabase,
   Firebase, or an API you already have. See
   [Writing a custom adapter](#writing-a-custom-adapter).

## Keeping Poke out of production

Poke is a review tool — it shouldn't reach real users. Gate it with `enabled`:

```js
init({ enabled: process.env.NODE_ENV !== "production" }); // Node / Next
init({ enabled: import.meta.env.DEV });                    // Vite
```

Anything other than `true` or a dev-ish string (`"development"`, `"staging"`,
`"test"`, `"preview"`, `"local"`) makes `init()` a complete no-op — no UI, no
network — and it still returns a valid instance so your code doesn't need a
guard around it.

## Identity

| You pass | Author of comments | Name prompt |
|---|---|---|
| `user: { id, name }` | that user | never |
| `user: { name: "Sam" }` | a stable per-browser id, name pre-filled | never |
| nothing | a stable per-browser id | on first comment, then remembered |

Not authentication — anyone can type any name — but the right weight for "a
client opens a link and leaves feedback." `init()` returns an `identity`
handle (`identity.name`, `identity.setName(...)`) if you want to drive it
yourself.

## `createPoke` reference

```ts
createPoke({
  database,        // required: a pg.Pool, or anything shaped like one
  getUser,         // (req) => PokeUser | null — derive the author from your session
  allowAnonymous,  // trust the client's own author instead of getUser. default false
  project,         // namespace comments when one DB serves multiple apps. default "default"
  origins,         // CORS allowlist: "*", an exact origin, or "https://*.example.com". default "*"
  realtime,        // SSE live updates. default true — see note below
})
```

<details>
<summary>Realtime on serverless/edge platforms</summary>

The live-update stream is in-process: a write on one server instance notifies
subscribers connected to *that instance*. Exactly right for a single
long-lived Node process. On serverless/edge platforms that run many
short-lived instances, two people on different instances won't see each
other's comments appear live — reads are always correct, just not always
pushed instantly. Set `realtime: false` to skip the SSE route where long
connections don't work; viewers pick up changes on their next navigation.

</details>

## Standalone server (non-Node.js backends)

A ~350-line Postgres-backed server you deploy on its own — for a non-Node
backend, or when you'd rather keep Poke fully separate from your app. Full
instructions (Railway, Fly, Docker) are in
[`server/README.md`](https://github.com/yusuf-ishaku/poke/blob/main/server/README.md).

```bash
cd server && npm install
docker compose up -d                              # or bring your own Postgres
DATABASE_URL=postgres://poke:poke@localhost:5432/poke npm run migrate
node --env-file=.env src/server.js                 # http://localhost:4000
```

Point the client at it the same way, just with a full URL:

```js
adapter: new HttpAdapter({ baseUrl: "https://your-poke-server.example.com" })
```

<details>
<summary>The REST contract (for either backend, or a custom one)</summary>

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/pages/:pageId/threads` | — | `PokeThread[]` (one page) |
| `GET` | `/threads` | — | `PokeThread[]` (whole app — the sidebar) |
| `POST` | `/threads` | `PokeThread` | `201` |
| `POST` | `/threads/:id/messages` | `{ body, author }` | `PokeMessage` |
| `PATCH` | `/threads/:id` | `{ status }` | `200` |
| `PATCH` | `/messages/:id` | `{ body }` | `200` |
| `DELETE` | `/threads/:id` | — | `204` |
| `GET` | `/pages/:pageId/events` | — | SSE stream (`:pageId` may be `*` for every page) |

</details>

## Writing a custom adapter

Implement `StorageAdapter` against Supabase, Firebase, or your own API — six
methods (all may be async) plus an optional `subscribe()` for realtime:

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
breaks the moment the page reflows or the viewport changes. Poke instead
remembers *which element* a comment belongs to.

When you drop a pin, Poke captures an `ElementAnchor` — a redundant
description of the target: a CSS selector that prefers stable hooks (`id`,
`data-testid`) over hashed/generated ones, a structural path
(`body > main > ul > li:3`) that survives class churn, identifying attributes,
trimmed text content, and where *within* the element you clicked. On the next
load, `resolveAnchor()` scores candidate elements against all of that evidence
at once — any single signal can go stale and the pin still lands, because the
others corroborate.

```ts
import { captureAnchor, resolveAnchor, anchorPoint } from "@appliftlabs/poke";

const anchor = captureAnchor(clickedElement, { clientX, clientY });
saveToYourStore(comment, anchor); // anchor is plain JSON

// later, on any page load:
const { element, confidence } = resolveAnchor(anchor);
if (element) {
  const { x, y } = anchorPoint(element, anchor);
  drawPinAt(x, y); // confidence: "exact" | "high" | "medium" | "low" | "lost"
}
```

## Development

```bash
npm install
npm test           # vitest — jsdom for the client, real Postgres for src/server (opt-in)
npm run typecheck
npm run build       # dist/ — ESM, CJS, a script-tag IIFE, and the /server, /next-js, /node entries
```

`examples/demo.html` is the full comment layer on a sample page.
`examples/anchor-playground.html` shuffles the DOM live to show re-anchoring.
`examples/frameworks/` has one runnable file per framework.

## License

MIT © Applift Labs
