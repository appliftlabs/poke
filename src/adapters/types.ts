/**
 * The storage adapter contract. Poke's core is storage-agnostic: it talks to
 * this interface and nothing else. Ship the bundled LocalStorageAdapter for a
 * zero-infra start, or implement this against a REST API, Firebase, Supabase,
 * a websocket server — whatever the host team already runs.
 *
 * Every method may be async. Adapters that can push changes from other clients
 * call the listener registered via `subscribe`; adapters that can't just never
 * call it, and Poke falls back to local-only updates.
 */
import type {
  PokeMessage,
  PokeThread,
  PokeUser,
  StoreListener,
} from "../core/types.js";

export interface AddMessageInput {
  threadId: string;
  body: string;
  /**
   * Who is posting this reply — the current user, which may differ from the
   * thread's author. A backend with real auth should derive the author from the
   * session instead of trusting this; adapters without auth (localStorage, the
   * reference server) use it as-is.
   */
  author: PokeUser;
}

export interface StorageAdapter {
  /**
   * Optional one-time setup (open a connection, run a migration). Called once
   * before any other method. Errors here surface to the host as init failure.
   */
  init?(): Promise<void> | void;

  /** All threads for one page, in creation order. */
  listThreads(pageId: string): Promise<PokeThread[]> | PokeThread[];

  /**
   * Every thread this adapter can see, across all pages, in creation order.
   * Powers the "all comments" sidebar. Optional: if an adapter can't do this
   * efficiently, omit it and the sidebar falls back to the current page only.
   *
   * For a backend, "all" means all threads in this deployment's namespace
   * (e.g. the server's POKE_PROJECT). It is not meant to cross projects.
   */
  listAllThreads?(): Promise<PokeThread[]> | PokeThread[];

  /** Persist a brand-new thread (it already has its id and first message). */
  createThread(thread: PokeThread): Promise<void> | void;

  /** Append a reply. Returns the created message so the caller gets its id/time. */
  addMessage(input: AddMessageInput): Promise<PokeMessage> | PokeMessage;

  /** Patch mutable thread fields (currently just status). */
  updateThread(
    threadId: string,
    patch: Partial<Pick<PokeThread, "status">>,
  ): Promise<void> | void;

  /** Edit a message body. */
  updateMessage(messageId: string, body: string): Promise<void> | void;

  /** Remove a thread and all its messages. */
  deleteThread(threadId: string): Promise<void> | void;

  /**
   * Register for change events from other clients/tabs. Return an unsubscribe
   * function. Optional — omit if the adapter has no realtime channel.
   */
  subscribe?(pageId: string, listener: StoreListener): () => void;

  /** Optional teardown. */
  dispose?(): Promise<void> | void;
}
