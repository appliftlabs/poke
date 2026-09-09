/**
 * Poke in Vue 3.
 *
 * Simplest: call this once after your app mounts (e.g. at the end of main.ts).
 * Env: VITE_POKE_URL = your backend URL. Drop the `adapter` line for localStorage.
 */
import type { PokeInstance } from "@appliftlabs/poke";

let instance: PokeInstance | undefined;

export async function startPoke(pageId = window.location.pathname) {
  const { init, HttpAdapter } = await import("@appliftlabs/poke");
  instance?.destroy();
  instance = init({
    enabled: import.meta.env.DEV, // never in a production build
    // user: { id: user.id, name: user.name },
    pageId,
    adapter: new HttpAdapter({ baseUrl: import.meta.env.VITE_POKE_URL }),
  });
  return instance;
}

export function stopPoke() {
  instance?.destroy();
  instance = undefined;
}

/*
 * main.ts:
 *
 *   import { createApp } from "vue";
 *   import App from "./App.vue";
 *   import router from "./router";
 *   import { startPoke } from "./poke";
 *
 *   createApp(App).use(router).mount("#app");
 *
 *   startPoke();
 *   // re-scope comments per route:
 *   router.afterEach((to) => startPoke(to.path));
 */
