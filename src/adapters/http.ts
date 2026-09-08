/**
 * HttpAdapter — persists comments to a backend over plain REST.
 *
 * This is the adapter to reach for when you want comments in a real database,
 * shared across users and devices. It expects a small JSON API (see the route
 * table below); a reference implementation lives in `examples/server/`.
 *
 *   import { init, HttpAdapter } from "@applift/poke";
 *
 *   init({
 *     user: { id: me.id, name: me.name },
 *     adapter: new HttpAdapter({
 *       baseUrl: "https://api.example.com/poke",
 *       headers: () => ({ Authorization: `Bearer ${getToken()}` }),
 *     }),
 *   });
 *
 * Expected API (all JSON):
 *   GET    {baseUrl}/pages/:pageId/threads      -> PokeThread[]
 *   POST   {baseUrl}/threads                    body: PokeThread        -> 201
 *   POST   {baseUrl}/threads/:id/messages       body: { body: string }  -> PokeMessage
 *   PATCH  {baseUrl}/threads/:id                body: { status? }       -> 200
 *   PATCH  {baseUrl}/messages/:id               body: { body: string }  -> 200
 *   DELETE {baseUrl}/threads/:id                                        -> 204
 *
 * Realtime is optional. If you pass `sseUrl` (or the backend exposes
 * `{baseUrl}/pages/:pageId/events`), the adapter opens an EventSource and
 * treats any message as "something changed, reload".
 */
import type {
  PokeMessage,
  PokeThread,
  StoreListener,
} from "../core/types.js";
import type { AddMessageInput, StorageAdapter } from "./types.js";

export interface HttpAdapterOptions {
  /** Root URL of the Poke API, no trailing slash. */
  baseUrl: string;
  /**
   * Extra headers for every request — a function so tokens can refresh.
   * `Content-Type: application/json` is added automatically for writes.
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Passed through to fetch (e.g. "include" to send cookies cross-origin). */
  credentials?: RequestCredentials;
  /**
   * URL of a Server-Sent-Events stream for realtime. `:pageId` in the string is
   * replaced with the current page id. Defaults to
   * `{baseUrl}/pages/:pageId/events`; pass `null` to disable realtime entirely.
   */
  sseUrl?: string | null;
  /** Swap in a custom fetch (tests, non-browser runtimes). */
  fetch?: typeof fetch;
}

export class HttpAdapter implements StorageAdapter {
  private readonly opts: HttpAdapterOptions;
  private readonly doFetch: typeof fetch;
  private sources = new Map<string, EventSource>();

  constructor(options: HttpAdapterOptions) {
    this.opts = options;
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    if (!this.opts.baseUrl) {
      throw new Error("[poke] HttpAdapter needs a baseUrl.");
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const extra = (await this.opts.headers?.()) ?? {};
    const headers: Record<string, string> = { ...extra };
    if (init.body != null) headers["Content-Type"] = "application/json";

    const res = await this.doFetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers,
      ...(this.opts.credentials ? { credentials: this.opts.credentials } : {}),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `[poke] ${init.method ?? "GET"} ${path} -> ${res.status} ${detail}`.trim(),
      );
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  listThreads(pageId: string): Promise<PokeThread[]> {
    return this.request<PokeThread[]>(
      `/pages/${encodeURIComponent(pageId)}/threads`,
    );
  }

  async createThread(thread: PokeThread): Promise<void> {
    await this.request<void>("/threads", {
      method: "POST",
      body: JSON.stringify(thread),
    });
  }

  addMessage(input: AddMessageInput): Promise<PokeMessage> {
    return this.request<PokeMessage>(
      `/threads/${encodeURIComponent(input.threadId)}/messages`,
      { method: "POST", body: JSON.stringify({ body: input.body }) },
    );
  }

  async updateThread(
    threadId: string,
    patch: Partial<Pick<PokeThread, "status">>,
  ): Promise<void> {
    await this.request<void>(`/threads/${encodeURIComponent(threadId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  async updateMessage(messageId: string, body: string): Promise<void> {
    await this.request<void>(`/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.request<void>(`/threads/${encodeURIComponent(threadId)}`, {
      method: "DELETE",
    });
  }

  subscribe(pageId: string, listener: StoreListener): () => void {
    if (this.opts.sseUrl === null || typeof EventSource === "undefined") {
      return () => {};
    }
    const template =
      this.opts.sseUrl ?? `${this.opts.baseUrl}/pages/:pageId/events`;
    const url = template.replace(":pageId", encodeURIComponent(pageId));

    const src = new EventSource(url, {
      withCredentials: this.opts.credentials === "include",
    });
    // Any event = "state changed, reload". A richer backend could send typed
    // deltas and this could forward them, but reload is correct and simple.
    src.onmessage = () => listener({ type: "reload" });
    src.onerror = () => {
      /* EventSource auto-reconnects; nothing to do */
    };
    this.sources.set(pageId, src);

    return () => {
      src.close();
      this.sources.delete(pageId);
    };
  }

  dispose(): void {
    for (const src of this.sources.values()) src.close();
    this.sources.clear();
  }
}
