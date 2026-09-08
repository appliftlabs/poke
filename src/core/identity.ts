/**
 * Lightweight, browser-local identity for Poke.
 *
 * When the host app doesn't pass a `user` to `init()`, Poke needs *some* way to
 * attribute comments. This module gives each browser a stable anonymous id the
 * first time it's used, and lets the person set a display name that's remembered
 * for next time. The name is shown to everyone else exactly like a host-provided
 * name — it's stored on every message via the adapter.
 *
 * This is intentionally not authentication. Anyone can set any name; the id is
 * per-browser, not per-person. It's the right amount of identity for "a client
 * opens a link and leaves feedback". Apps that have real accounts should pass
 * `user` to `init()` and skip all of this.
 */
import { newId } from "./id.js";
import type { PokeUser } from "./types.js";

const STORAGE_KEY = "poke:identity";

export interface StoredIdentity {
  id: string;
  /** Undefined until the person sets one. */
  name?: string;
  color?: string;
}

interface IdentityBackend {
  read(): StoredIdentity | null;
  write(value: StoredIdentity): void;
}

function localStorageBackend(): IdentityBackend {
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredIdentity;
        return parsed && typeof parsed.id === "string" ? parsed : null;
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* private mode / disabled storage — identity just won't persist */
      }
    },
  };
}

/** In-memory fallback so things still work when localStorage is unavailable. */
function memoryBackend(seed: StoredIdentity | null): IdentityBackend {
  let value = seed;
  return {
    read: () => value,
    write: (v) => {
      value = v;
    },
  };
}

/** A soft, readable colour derived from an id (matches the avatar hashing). */
function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return `hsl(${Math.abs(hash) % 360} 55% 55%)`;
}

export interface LocalIdentityOptions {
  /** Provide a backend (tests). Defaults to localStorage, then in-memory. */
  backend?: IdentityBackend;
  /**
   * A name to use. Applied only if no name is already stored — so a first-time
   * visitor is pre-filled but a returning one keeps the name they chose.
   */
  initialName?: string;
  /**
   * A name that *overrides* whatever is stored. Use when the host explicitly
   * tells Poke who this is on every load (e.g. `init({ user: { name } })`) —
   * that's a deliberate signal, not just a default.
   */
  forceName?: string;
}

/**
 * Manages the browser-local identity: creates a stable id on first use, exposes
 * the current name, and persists name changes.
 */
export class LocalIdentity {
  private readonly backend: IdentityBackend;
  private current: StoredIdentity;

  constructor(options: LocalIdentityOptions = {}) {
    const hasLS =
      typeof window !== "undefined" &&
      (() => {
        try {
          return !!window.localStorage;
        } catch {
          return false;
        }
      })();

    this.backend =
      options.backend ?? (hasLS ? localStorageBackend() : memoryBackend(null));

    const existing = this.backend.read();
    if (existing) {
      this.current = existing;
      if (options.forceName && options.forceName.trim() !== existing.name) {
        this.setName(options.forceName);
      } else if (options.initialName && !existing.name) {
        this.setName(options.initialName);
      }
    } else {
      const id = newId("anon");
      this.current = { id, color: colorFromId(id) };
      const seed = options.forceName ?? options.initialName;
      if (seed) this.current.name = seed.trim().slice(0, 60);
      this.backend.write(this.current);
    }
  }

  get id(): string {
    return this.current.id;
  }

  get name(): string | undefined {
    return this.current.name;
  }

  /** True once the person has a display name (host- or self-provided). */
  get isNamed(): boolean {
    return !!this.current.name && this.current.name.trim().length > 0;
  }

  /** The best PokeUser we can offer right now. `name` falls back to "Anonymous". */
  get user(): PokeUser {
    return {
      id: this.current.id,
      name: this.current.name?.trim() || "Anonymous",
      ...(this.current.color ? { color: this.current.color } : {}),
    };
  }

  setName(name: string): PokeUser {
    const trimmed = name.trim().slice(0, 60);
    const next: StoredIdentity = { id: this.current.id };
    if (this.current.color) next.color = this.current.color;
    if (trimmed) next.name = trimmed;
    this.current = next;
    this.backend.write(this.current);
    return this.user;
  }
}
