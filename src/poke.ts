/**
 * The public entry point: `Poke.init(...)`.
 *
 *   import { init } from "@applift/poke";
 *   const poke = init({
 *     user: { id: "u_12", name: "Ada Lovelace" },
 *   });
 *
 * With no adapter, Poke uses the bundled localStorage adapter — zero infra, good
 * for a quick trial or single-user review. Pass `adapter` to sync through your
 * own backend.
 */
import { LocalStorageAdapter } from "./adapters/local-storage.js";
import type { StorageAdapter } from "./adapters/types.js";
import { CommentStore } from "./core/store.js";
import type { PokeUser } from "./core/types.js";
import { mountUI, type MountHandle } from "./ui/mount.js";

export interface PokeConfig {
  /** The person leaving comments. Required — Poke never guesses identity. */
  user: PokeUser;

  /**
   * Identifies "this page" so comments are scoped to it. Defaults to
   * `location.pathname`. Set it explicitly for apps where the path alone isn't
   * stable (hash routing, query-string state) or where you want one comment set
   * across a group of URLs.
   */
  pageId?: string;

  /** Storage backend. Defaults to a localStorage adapter. */
  adapter?: StorageAdapter;

  /** Start with the UI mounted. Default true. */
  autoMount?: boolean;
}

export interface PokeInstance {
  store: CommentStore;
  /** Render the overlay if it isn't already. */
  mount(): void;
  /** Remove the overlay (comments stay in storage). */
  unmount(): void;
  /** Tear everything down. */
  destroy(): Promise<void>;
}

export function init(config: PokeConfig): PokeInstance {
  if (!config?.user?.id || !config.user.name) {
    throw new Error(
      "[poke] init() requires a `user` with at least { id, name }.",
    );
  }

  const pageId =
    config.pageId ??
    (typeof location !== "undefined" ? location.pathname : "default");

  const adapter = config.adapter ?? new LocalStorageAdapter();
  const store = new CommentStore({ adapter, pageId, user: config.user });

  let handle: MountHandle | null = null;
  const mount = () => {
    if (!handle) handle = mountUI(store);
  };
  const unmount = () => {
    handle?.unmount();
    handle = null;
  };

  // Kick off loading; mount as soon as the DOM is ready.
  const ready = store.start();
  if (config.autoMount !== false) {
    void ready.then(() => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
      } else {
        mount();
      }
    });
  }

  return {
    store,
    mount,
    unmount,
    async destroy() {
      unmount();
      await store.stop();
    },
  };
}
