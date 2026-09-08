/**
 * Domain types for Poke's comment layer. These are the shapes that flow between
 * the UI, the store, and storage adapters — all plain JSON so any adapter can
 * persist them without translation.
 */
import type { ElementAnchor } from "../anchor/index.js";

/** A person leaving comments. Supplied by the host app; Poke never invents one. */
export interface PokeUser {
  id: string;
  name: string;
  /** Optional avatar URL or a short string to render as initials. */
  avatar?: string;
  color?: string;
}

/** A single message within a thread. */
export interface PokeMessage {
  id: string;
  threadId: string;
  author: PokeUser;
  body: string;
  /** Epoch milliseconds. */
  createdAt: number;
  editedAt?: number;
}

export type ThreadStatus = "open" | "resolved";

/**
 * A thread is one pin on the page: an anchor plus its messages. The first
 * message is the comment; the rest are replies.
 */
export interface PokeThread {
  id: string;
  /** The page this thread belongs to (see PokeConfig.pageId). */
  pageId: string;
  anchor: ElementAnchor;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  author: PokeUser;
  messages: PokeMessage[];
  /**
   * Filled in at render time by resolving the anchor — never persisted.
   * Lets the UI show a "couldn't locate this element" state.
   */
  resolution?: {
    found: boolean;
    confidence: import("../anchor/index.js").AnchorConfidence;
  };
}

/** The subset of a thread needed to create it. */
export interface NewThreadInput {
  anchor: ElementAnchor;
  body: string;
}

/**
 * Events an adapter can emit so multiple clients / tabs stay in sync. Adapters
 * that don't support realtime simply never call the subscriber.
 */
export type StoreEvent =
  | { type: "thread:created"; thread: PokeThread }
  | { type: "thread:updated"; thread: PokeThread }
  | { type: "thread:deleted"; threadId: string }
  | { type: "message:created"; message: PokeMessage }
  | { type: "reload" };

export type StoreListener = (event: StoreEvent) => void;
