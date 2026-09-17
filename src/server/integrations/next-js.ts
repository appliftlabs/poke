/**
 * Next.js App Router integration.
 *
 *   // app/api/poke/[...poke]/route.ts
 *   import { createPoke } from "@appliftlabs/poke/server";
 *   import { toNextJsHandler } from "@appliftlabs/poke/next-js";
 *   import { Pool } from "pg";
 *
 *   const poke = createPoke({
 *     database: new Pool({ connectionString: process.env.DATABASE_URL }),
 *     getUser: async () => {
 *       const session = await auth(); // your existing auth
 *       return session && { id: session.user.id, name: session.user.name };
 *     },
 *   });
 *
 *   export const { GET, POST, PATCH, DELETE } = toNextJsHandler(poke.handler);
 *
 * Then point the client at the same origin:
 *
 *   adapter: new HttpAdapter({ baseUrl: "/api/poke" })
 *
 * Realtime (SSE) needs a long-lived connection. On Vercel that means the
 * Node.js runtime (not Edge) and works on most plans, but check yours — some
 * serverless platforms cap request duration in a way that kills SSE. See the
 * "Realtime & deployment" section of the docs.
 */
export type NextJsRouteHandler = (req: Request) => Promise<Response>;

export interface NextJsHandlers {
  GET: NextJsRouteHandler;
  POST: NextJsRouteHandler;
  PATCH: NextJsRouteHandler;
  DELETE: NextJsRouteHandler;
}

export function toNextJsHandler(
  handler: (req: Request) => Promise<Response>,
): NextJsHandlers {
  return { GET: handler, POST: handler, PATCH: handler, DELETE: handler };
}
