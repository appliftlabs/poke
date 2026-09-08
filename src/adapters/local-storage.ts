/**
 * The batteries-included adapter: stores threads in localStorage, keyed by page.
 * Zero infra — good for demos, single-user review, and "try it in five minutes".
 *
 * Realtime: it listens for the browser `storage` event, so two tabs of the same
 * origin stay in sync. It does NOT sync across devices or users — for that,
 * write an adapter against your own backend.
 */
import type {
  PokeMessage,
  PokeThread,
  StoreEvent,
  StoreListener,
} from "../core/types.js";
import { newId } from "../core/id.js";
import type { AddMessageInput, StorageAdapter } from "./types.js";

export interface LocalStorageAdapterOptions {
  /** Key prefix in localStorage. Default "poke". */
  namespace?: string;
  /** Provide a custom Storage (e.g. for tests). Default window.localStorage. */
  storage?: Storage;
}

const DEFAULT_NS = "poke";

export class LocalStorageAdapter implements StorageAdapter {
  private readonly ns: string;
  private readonly storage: Storage;
  private readonly listeners = new Map<string, Set<StoreListener>>();
  private onStorage: ((e: StorageEvent) => void) | undefined;

  constructor(options: LocalStorageAdapterOptions = {}) {
    this.ns = options.namespace ?? DEFAULT_NS;
    const storage = options.storage ?? safeLocalStorage();
    if (!storage) {
      throw new Error(
        "[poke] localStorage is unavailable. Pass a `storage` option or use a different adapter.",
      );
    }
    this.storage = storage;
  }

  // --- reads / writes -----------------------------------------------------

  private keyPrefix(): string {
    return `${this.ns}:threads:`;
  }

  private key(pageId: string): string {
    return `${this.keyPrefix()}${pageId}`;
  }

  private read(pageId: string): PokeThread[] {
    try {
      const raw = this.storage.getItem(this.key(pageId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as PokeThread[]) : [];
    } catch {
      return [];
    }
  }

  private write(pageId: string, threads: PokeThread[]): void {
    this.storage.setItem(this.key(pageId), JSON.stringify(threads));
  }

  private knownPages(): string[] {
    const prefix = this.keyPrefix();
    const pages: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) pages.push(key.slice(prefix.length));
    }
    return pages;
  }

  /** Find which page a thread lives on, returning that page's whole array. */
  private locate(threadId: string): {
    pageId: string;
    threads: PokeThread[];
    thread: PokeThread;
  } {
    for (const pageId of this.knownPages()) {
      const threads = this.read(pageId);
      const thread = threads.find((t) => t.id === threadId);
      if (thread) return { pageId, threads, thread };
    }
    throw new Error(`[poke] thread not found: ${threadId}`);
  }

  private emit(pageId: string, event: StoreEvent): void {
    this.listeners.get(pageId)?.forEach((l) => {
      try {
        l(event);
      } catch {
        /* one listener throwing must not break the rest */
      }
    });
  }

  // --- StorageAdapter ---------------------------------------------------

  listThreads(pageId: string): PokeThread[] {
    return this.read(pageId).sort((a, b) => a.createdAt - b.createdAt);
  }

  createThread(thread: PokeThread): void {
    const threads = this.read(thread.pageId);
    threads.push(thread);
    this.write(thread.pageId, threads);
    this.emit(thread.pageId, { type: "thread:created", thread });
  }

  addMessage(input: AddMessageInput): PokeMessage {
    const { pageId, threads, thread } = this.locate(input.threadId);
    const message: PokeMessage = {
      id: newId("msg"),
      threadId: thread.id,
      author: thread.author,
      body: input.body,
      createdAt: Date.now(),
    };
    thread.messages.push(message);
    thread.updatedAt = message.createdAt;
    this.write(pageId, threads);
    this.emit(pageId, { type: "message:created", message });
    this.emit(pageId, { type: "thread:updated", thread });
    return message;
  }

  updateThread(
    threadId: string,
    patch: Partial<Pick<PokeThread, "status">>,
  ): void {
    const { pageId, threads, thread } = this.locate(threadId);
    if (patch.status) thread.status = patch.status;
    thread.updatedAt = Date.now();
    this.write(pageId, threads);
    this.emit(pageId, { type: "thread:updated", thread });
  }

  updateMessage(messageId: string, body: string): void {
    for (const pageId of this.knownPages()) {
      const threads = this.read(pageId);
      let hit: PokeThread | undefined;
      for (const thread of threads) {
        const msg = thread.messages.find((m) => m.id === messageId);
        if (!msg) continue;
        msg.body = body;
        msg.editedAt = Date.now();
        thread.updatedAt = msg.editedAt;
        hit = thread;
        break;
      }
      if (hit) {
        this.write(pageId, threads);
        this.emit(pageId, { type: "thread:updated", thread: hit });
        return;
      }
    }
  }

  deleteThread(threadId: string): void {
    for (const pageId of this.knownPages()) {
      const threads = this.read(pageId);
      const next = threads.filter((t) => t.id !== threadId);
      if (next.length === threads.length) continue;
      this.write(pageId, next);
      this.emit(pageId, { type: "thread:deleted", threadId });
      return;
    }
  }

  subscribe(pageId: string, listener: StoreListener): () => void {
    let set = this.listeners.get(pageId);
    if (!set) {
      set = new Set();
      this.listeners.set(pageId, set);
    }
    set.add(listener);

    // Cross-tab sync: another tab of this origin wrote to one of our keys.
    if (!this.onStorage && typeof window !== "undefined") {
      this.onStorage = (e: StorageEvent) => {
        const prefix = this.keyPrefix();
        if (!e.key || !e.key.startsWith(prefix)) return;
        this.emit(e.key.slice(prefix.length), { type: "reload" });
      };
      window.addEventListener("storage", this.onStorage);
    }

    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(pageId);
    };
  }

  dispose(): void {
    if (this.onStorage && typeof window !== "undefined") {
      window.removeEventListener("storage", this.onStorage);
      this.onStorage = undefined;
    }
    this.listeners.clear();
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probe = "__poke_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}
