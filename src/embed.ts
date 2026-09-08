/**
 * Script-tag entry point.
 *
 *   <script
 *     src="https://cdn.example.com/poke.global.js"
 *     data-poke-user-id="u_12"
 *     data-poke-user-name="Ada Lovelace"
 *     data-poke-page-id="/checkout"          // optional
 *     data-poke-auto="true"                   // optional, default true
 *   ></script>
 *
 * Reads config from the tag's data-* attributes and calls init(). When the user
 * id/name aren't on the tag, it does nothing but expose `window.Poke.init` so
 * the host can start it manually once identity is known (e.g. after login).
 */
import { init, type PokeInstance } from "./poke.js";
import { LocalStorageAdapter } from "./adapters/local-storage.js";

function currentScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  const scripts = document.getElementsByTagName("script");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const s = scripts[i]!;
    if (s.src && /poke(\.global)?\.js/.test(s.src)) return s;
  }
  return null;
}

function boot(): PokeInstance | null {
  const tag = currentScript();
  const d = tag?.dataset ?? {};

  const auto = d.pokeAuto !== "false";
  const userId = d.pokeUserId;
  const userName = d.pokeUserName;

  if (!auto || !userId || !userName) return null;

  return init({
    user: {
      id: userId,
      name: userName,
      ...(d.pokeUserAvatar ? { avatar: d.pokeUserAvatar } : {}),
      ...(d.pokeUserColor ? { color: d.pokeUserColor } : {}),
    },
    ...(d.pokePageId ? { pageId: d.pokePageId } : {}),
  });
}

const instance = boot();

// Public surface on window.Poke (tsup globalName). Includes init() so hosts
// that couldn't auto-boot (no identity yet) can start it later.
export { init, LocalStorageAdapter };
export const auto = instance;
export * from "./anchor/index.js";
