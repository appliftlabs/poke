/**
 * Poke in Next.js (App Router).
 *
 * app/layout.tsx is a Server Component and can't call init() directly, so this
 * client component does it. It also re-scopes comments to the current route.
 *
 *   // app/layout.tsx
 *   import { Poke } from "./poke";
 *
 *   export default function RootLayout({ children }: { children: React.ReactNode }) {
 *     return (
 *       <html lang="en">
 *         <body>
 *           {children}
 *           <Poke />
 *         </body>
 *       </html>
 *     );
 *   }
 *
 * Env: NEXT_PUBLIC_POKE_URL = your backend URL (the NEXT_PUBLIC_ prefix is
 * required for it to reach the browser). Drop the `adapter` line for localStorage.
 */
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { PokeInstance } from "@appliftlabs/poke";

export function Poke() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let instance: PokeInstance | undefined;
    let cancelled = false;

    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      if (cancelled) return;
      instance = init({
        // pass a real user here if the app has auth:
        // user: { id: session.user.id, name: session.user.name },
        pageId: pathname,
        adapter: new HttpAdapter({
          baseUrl: process.env.NEXT_PUBLIC_POKE_URL!,
        }),
        // "☰ All" sidebar: selecting a comment on another route routes there.
        onNavigate: (pageId) => router.push(pageId),
      });
    });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
    // Re-run on route change so comments are scoped per page.
  }, [pathname, router]);

  return null;
}
