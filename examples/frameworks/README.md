# Framework setup examples

Minimal, copy-pasteable integrations. Each assumes you've deployed the backend
(see [`../../server/`](../../server/)) and have its URL; drop the `adapter` line
to run against `localStorage` instead (single browser, no server).

| File | Stack |
|---|---|
| [`vanilla.html`](vanilla.html) | Plain HTML, no build step |
| [`react.tsx`](react.tsx) | React (Vite / CRA / any bundler) |
| [`nextjs-app-router.tsx`](nextjs-app-router.tsx) | Next.js App Router |
| [`nextjs-pages-router.tsx`](nextjs-pages-router.tsx) | Next.js Pages Router |
| [`vue.ts`](vue.ts) | Vue 3 |
| [`svelte.svelte`](svelte.svelte) | Svelte / SvelteKit |

The pattern is the same everywhere:

1. **Load Poke in the browser only** — it uses `window`/`document`. In SSR
   frameworks that means a dynamic `import()` inside a mount/effect hook.
2. **Call `init()` once**, near the app root.
3. **Call the returned `destroy()`** on teardown.
4. Put the backend URL in a build-time public env var
   (`VITE_POKE_URL`, `NEXT_PUBLIC_POKE_URL`, …).
