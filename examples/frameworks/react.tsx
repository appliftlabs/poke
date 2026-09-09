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
import type { PokeInstance, PokeUser } from "@appliftlabs/poke";

interface PokeProps {
  /** Your logged-in user, if you have one. Omit for the name prompt. */
  user?: PokeUser;
}

export function Poke({ user }: PokeProps) {
  useEffect(() => {
    let instance: PokeInstance | undefined;

    // Dynamic import so Poke is only loaded in the browser and can be
    // code-split out of the initial bundle.
    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      instance = init({
        ...(user ? { user } : {}),
        pageId: window.location.pathname,
        adapter: new HttpAdapter({
          baseUrl: import.meta.env.VITE_POKE_URL,
        }),
      });
    });

    return () => instance?.destroy();
  }, [user]);

  return null;
}
