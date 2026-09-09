/**
 * CommentStore — the seam between the UI and a StorageAdapter.
 *
 * Responsibilities:
 *  - hold the current page's threads in memory
 *  - create threads / messages, delegating persistence to the adapter
 *  - re-resolve each thread's anchor to a live element on demand
 *  - notify UI subscribers when anything changes (local edits *and* adapter
 *    push events)
 *
 * It deliberately knows nothing about DOM rendering or Preact.
 */
import { resolveAnchor } from "../anchor/index.js";
import type { StorageAdapter } from "../adapters/types.js";
import { newId } from "./id.js";
import type {
  NewThreadInput,
  PokeThread,
  PokeUser,
  StoreEvent,
} from "./types.js";

export interface CommentStoreOptions {
  adapter: StorageAdapter;
  pageId: string;
  /**
   * The current user, used to attribute new comments. May be updated later via
   * `setUser()` — e.g. when someone sets their display name after mount.
   */
  user: PokeUser;
}

type Unsubscribe = () => void;

export class CommentStore {
  /** Threads on the current page — these get pins drawn. */
  private threads: PokeThread[] = [];
  /**
   * Every thread across the whole app/project — powers the "all comments"
   * sidebar. Empty if the adapter doesn't support `listAllThreads`.
   */
  private allThreads: PokeThread[] = [];
  private readonly subscribers = new Set<() => void>();
  private adapterUnsub: Unsubscribe | undefined;
  private loaded = false;
  private currentUser: PokeUser;

  constructor(private readonly opts: CommentStoreOptions) {
    this.currentUser = opts.user;
  }

  get pageId(): string {
    return this.opts.pageId;
  }

  get user(): PokeUser {
    return this.currentUser;
  }

  /**
   * Replace the current user. New comments and replies are attributed to this
   * user from now on; existing ones are unchanged. Notifies subscribers so the
   * UI can react (e.g. hide the "set your name" prompt).
   */
  setUser(user: PokeUser): void {
    this.currentUser = user;
    this.emit();
  }

  /** Load threads and wire up adapter push events. Call once. */
  async start(): Promise<void> {
    await this.opts.adapter.init?.();
    await this.refresh();

    this.adapterUnsub = this.opts.adapter.subscribe?.(
      this.opts.pageId,
      (event) => void this.onAdapterEvent(event),
    );
    this.loaded = true;
  }

  async stop(): Promise<void> {
    this.adapterUnsub?.();
    this.adapterUnsub = undefined;
    await this.opts.adapter.dispose?.();
    this.subscribers.clear();
  }

  /** Re-read everything from the adapter and re-resolve anchors. */
  async refresh(): Promise<void> {
    const [pageThreads, all] = await Promise.all([
      this.opts.adapter.listThreads(this.opts.pageId),
      this.opts.adapter.listAllThreads?.() ?? Promise.resolve(null),
    ]);

    this.threads = pageThreads.map((t) => this.withResolution(t));

    if (all) {
      // Keep resolution info for threads that are also on this page.
      const resolvedById = new Map(this.threads.map((t) => [t.id, t]));
      this.allThreads = all.map((t) => resolvedById.get(t.id) ?? t);
    } else {
      // Adapter can't list app-wide — the sidebar shows the current page only.
      this.allThreads = this.threads;
    }

    this.emit();
  }

  /** Threads on the current page, with fresh anchor resolution. Drives pins. */
  list(): PokeThread[] {
    return this.threads;
  }

  /**
   * Every thread across the app (or the current page, if the adapter can't do
   * app-wide). Drives the "all comments" sidebar.
   */
  listAll(): PokeThread[] {
    return this.allThreads;
  }

  getThread(id: string): PokeThread | undefined {
    return (
      this.threads.find((t) => t.id === id) ??
      this.allThreads.find((t) => t.id === id)
    );
  }

  /** Recompute where every thread's pin should sit (call on layout changes). */
  reresolve(): void {
    this.threads = this.threads.map((t) => this.withResolution(t));
    this.emit();
  }

  async createThread(input: NewThreadInput): Promise<PokeThread> {
    const now = Date.now();
    const id = newId("thr");
    const thread: PokeThread = {
      id,
      pageId: this.opts.pageId,
      anchor: input.anchor,
      status: "open",
      createdAt: now,
      updatedAt: now,
      author: this.currentUser,
      messages: [
        {
          id: newId("msg"),
          threadId: id,
          author: this.currentUser,
          body: input.body,
          createdAt: now,
        },
      ],
    };

    await this.opts.adapter.createThread(thread);
    await this.refresh();
    return this.getThread(id) ?? this.withResolution(thread);
  }

  async reply(threadId: string, body: string): Promise<void> {
    await this.opts.adapter.addMessage({
      threadId,
      body,
      author: this.currentUser,
    });
    await this.refresh();
  }

  async setStatus(
    threadId: string,
    status: PokeThread["status"],
  ): Promise<void> {
    await this.opts.adapter.updateThread(threadId, { status });
    await this.refresh();
  }

  async editMessage(messageId: string, body: string): Promise<void> {
    await this.opts.adapter.updateMessage(messageId, body);
    await this.refresh();
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.opts.adapter.deleteThread(threadId);
    await this.refresh();
  }

  /** Subscribe to any change. Returns an unsubscribe fn. */
  subscribe(fn: () => void): Unsubscribe {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  // --- internals ---------------------------------------------------------

  private withResolution(thread: PokeThread): PokeThread {
    const { element, confidence } = resolveAnchor(thread.anchor);
    return {
      ...thread,
      resolution: { found: !!element, confidence },
    };
  }

  private async onAdapterEvent(event: StoreEvent): Promise<void> {
    // The localStorage adapter (and simple backends) just say "something
    // changed" — reload. Richer adapters can send precise deltas; handle the
    // ones worth optimizing and fall back to refresh for the rest.
    switch (event.type) {
      case "thread:deleted":
        this.threads = this.threads.filter((t) => t.id !== event.threadId);
        this.emit();
        return;
      case "reload":
      default:
        await this.refresh();
    }
  }

  private emit(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch {
        /* keep notifying the rest */
      }
    }
  }
}
