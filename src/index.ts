/**
 * @applift/poke — Figma-style pinned comments for any live web page.
 */
export { init, type PokeConfig, type PokeInstance } from "./poke.js";

export { CommentStore, type CommentStoreOptions } from "./core/store.js";
export type {
  PokeUser,
  PokeThread,
  PokeMessage,
  ThreadStatus,
  StoreEvent,
  StoreListener,
} from "./core/types.js";

export { LocalStorageAdapter } from "./adapters/local-storage.js";
export type {
  StorageAdapter,
  AddMessageInput,
} from "./adapters/types.js";

// The anchoring engine, for advanced use / custom UIs.
export * from "./anchor/index.js";
