import { useEffect, useRef, useState } from "preact/hooks";
import type { CommentStore } from "../core/store.js";
import type { PokeThread } from "../core/types.js";

/**
 * Subscribe a component to a CommentStore's thread list.
 *
 * Why not just `useEffect(() => store.subscribe(...))`? Preact runs effects
 * asynchronously, so a change that lands between first render and effect-flush
 * would be missed — and threads already loaded before the component mounts
 * wouldn't trigger the initial paint's data being "current". This hook
 * subscribes synchronously on first render and reconciles in the effect.
 */
export interface StoreThreads {
  /** Threads on the current page — these get pins. */
  page: PokeThread[];
  /** Every thread across the app — drives the sidebar. */
  all: PokeThread[];
}

export function useStoreThreads(store: CommentStore): StoreThreads {
  const [, setN] = useState(0);
  const forceRender = () => setN((n) => (n + 1) % 1_000_000);
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe exactly once, as early as possible (during first render).
  if (unsubRef.current === null) {
    unsubRef.current = store.subscribe(forceRender);
  }

  useEffect(() => {
    // If the store instance changed between renders, re-subscribe.
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [store]);

  return { page: store.list(), all: store.listAll() };
}
