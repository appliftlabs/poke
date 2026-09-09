/**
 * The public entry point: `Poke.init(...)`.
 *
 *   import { init } from "@appliftlabs/poke";
 *
 *   // App with real accounts — pass the user:
 *   init({ user: { id: "u_12", name: "Ada Lovelace" } });
 *
 *   // Shared review link, no accounts — omit it. Poke asks for a name the
 *   // first time someone comments and remembers it in that browser:
 *   init();
 *
 * With no adapter, Poke uses the bundled localStorage adapter — zero infra, good
 * for a quick trial or single-user review. Pass `adapter` to sync through your
 * own backend.
 */
import { LocalStorageAdapter } from "./adapters/local-storage.js";
import type { StorageAdapter } from "./adapters/types.js";
import { LocalIdentity } from "./core/identity.js";
import { CommentStore } from "./core/store.js";
import type { PokeUser } from "./core/types.js";
import { mountUI, type MountHandle } from "./ui/mount.js";

export interface PokeConfig {
  /**
   * The person leaving comments.
   *
   * Omit it and Poke manages a lightweight browser-local identity: a stable
   * anonymous id, and a display name it prompts for the first time someone
   * comments, then remembers (in localStorage) for their next visit. That name
   * is shown to everyone else, exactly like a host-provided one.
   *
   * Pass it when your app already knows who the user is (they're logged in).
   * You can also pass a partial `{ name }` to pre-fill the prompt.
   */
  user?: PokeUser | { name: string };

  /**
   * Identifies "this page" so comments are scoped to it. Defaults to
   * `location.pathname`. Set it explicitly for apps where the path alone isn't
   * stable (hash routing, query-string state) or where you want one comment set
   * across a group of URLs.
   */
  pageId?: string;

  /** Storage backend. Defaults to a localStorage adapter. */
  adapter?: StorageAdapter;

  /**
   * The sidebar lists comments from the whole app, including other routes.
   * Selecting one of those calls this so your app can route there. If omitted,
   * Poke does `location.assign(pageId)` — fine when `pageId` is a real path,
   * but a hard reload. Pass your router's navigate for a smooth transition:
   *
   *   onNavigate: (pageId) => router.push(pageId)
   */
  onNavigate?: (pageId: string) => void;

  /** Start with the UI mounted. Default true. */
  autoMount?: boolean;
}

export interface PokeInstance {
  store: CommentStore;
  /**
   * The browser-local identity, when Poke is managing one (i.e. `user` was not
   * a full `{ id, name }`). Use `identity.setName()` to wire up your own name
   * prompt, or read `identity.name` / `identity.isNamed`. `null` when the host
   * supplied a complete user.
   */
  identity: LocalIdentity | null;
  /** Render the overlay if it isn't already. */
  mount(): void;
  /** Remove the overlay (comments stay in storage). */
  unmount(): void;
  /** Tear everything down. */
  destroy(): Promise<void>;
}

function isCompleteUser(u: PokeConfig["user"]): u is PokeUser {
  return (
    !!u &&
    typeof (u as PokeUser).id === "string" &&
    (u as PokeUser).id.length > 0 &&
    typeof u.name === "string" &&
    u.name.length > 0
  );
}

export function init(config: PokeConfig = {}): PokeInstance {
  const pageId =
    config.pageId ??
    (typeof location !== "undefined" ? location.pathname : "default");

  const adapter = config.adapter ?? new LocalStorageAdapter();

  // Resolve identity.
  let identity: LocalIdentity | null = null;
  let user: PokeUser;

  if (isCompleteUser(config.user)) {
    // Host knows exactly who this is.
    user = config.user;
  } else {
    // Poke manages a browser-local identity. A partial `{ name }` passed on
    // every load is an explicit "this is who's here" — it wins over a stored
    // name. (A returning viewer with no `user` keeps the name they chose.)
    const forceName =
      config.user && typeof config.user.name === "string"
        ? config.user.name
        : undefined;
    identity = new LocalIdentity(forceName ? { forceName } : {});
    user = identity.user; // { id, name: <name> | "Anonymous", color }
  }

  const store = new CommentStore({ adapter, pageId, user });

  // Keep the store's user in sync with the identity's name as it changes.
  if (identity) {
    store.setUser(identity.user);
  }

  let handle: MountHandle | null = null;
  const mount = () => {
    if (!handle) {
      handle = mountUI(store, {
        identity,
        ...(config.onNavigate ? { onNavigate: config.onNavigate } : {}),
      });
    }
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
    identity,
    mount,
    unmount,
    async destroy() {
      unmount();
      await store.stop();
    },
  };
}
