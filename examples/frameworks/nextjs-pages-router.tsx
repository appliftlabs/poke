/**
 * Poke in Next.js (Pages Router).
 *
 * Put this in pages/_app.tsx. It mounts Poke once and re-scopes comments on
 * client-side navigation.
 *
 * Env: NEXT_PUBLIC_POKE_URL = your backend URL. Drop the `adapter` line for
 * localStorage (single browser, no server).
 */
import { useEffect } from "react";
import { useRouter } from "next/router";
import type { AppProps } from "next/app";
import type { PokeInstance } from "@appliftlabs/poke";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    let instance: PokeInstance | undefined;
    let cancelled = false;

    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      if (cancelled) return;
      instance = init({
        enabled: process.env.NODE_ENV !== "production",
        // user: { id: session.user.id, name: session.user.name },
        pageId: router.pathname,
        adapter: new HttpAdapter({
          baseUrl: process.env.NEXT_PUBLIC_POKE_URL!,
        }),
        onNavigate: (pageId) => router.push(pageId),
      });
    });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [router.pathname]);

  return <Component {...pageProps} />;
}
