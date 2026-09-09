/**
 * Poke in a React app (Vite, CRA, or any bundler).
 *
 * Render <Poke /> once, near the root:
 *
 *   function App() {
 *     return (
 *       <>
 *         <YourApp />
 *         <Poke user={currentUser} />
 *       </>
 *     );
 *   }
 *
 * Env: set VITE_POKE_URL (Vite) / REACT_APP_POKE_URL (CRA) to your backend URL,
 * or drop the `adapter` line to use localStorage.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom"; // swap for your router's hook
import type { PokeInstance, PokeUser } from "@appliftlabs/poke";

interface PokeProps {
  /** Your logged-in user, if you have one. Omit for the name prompt. */
  user?: PokeUser;
}

export function Poke({ user }: PokeProps) {
  // The current route. Comments are scoped by pageId, so this must be reactive —
  // window.location.pathname wouldn't update on client-side navigation.
  const { pathname } = useLocation();

  useEffect(() => {
    let instance: PokeInstance | undefined;
    let cancelled = false;

    // Dynamic import so Poke is only loaded in the browser and can be
    // code-split out of the initial bundle.
    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      if (cancelled) return;
      instance = init({
        enabled: import.meta.env.DEV, // never in a production build
        ...(user ? { user } : {}),
        pageId: pathname,
        adapter: new HttpAdapter({
          baseUrl: import.meta.env.VITE_POKE_URL,
        }),
      });
    });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
    // Re-init on route or user change.
  }, [pathname, user]);

  return null;
}

/*
 * No router? Use a fixed pageId, or window.location.pathname for a single-page
 * app that never navigates:
 *
 *   pageId: "my-app",              // one comment set for the whole app
 *   pageId: window.location.pathname,  // fine only if the path never changes
 */
