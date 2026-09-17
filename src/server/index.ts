/**
 * @appliftlabs/poke/server — run Poke's API inside your own app's routes.
 *
 * No separate deploy, no second database. One config call, mounted at a route
 * your framework already has:
 *
 *   import { createPoke } from "@appliftlabs/poke/server";
 *   import { toNextJsHandler } from "@appliftlabs/poke/next-js";  // or /node
 *   import { Pool } from "pg";
 *
 *   const poke = createPoke({
 *     database: new Pool({ connectionString: process.env.DATABASE_URL }),
 *     getUser: async (req) => {
 *       const session = await auth();
 *       return session && { id: session.user.id, name: session.user.name };
 *     },
 *   });
 *
 * See @appliftlabs/poke/next-js and @appliftlabs/poke/node for how to mount
 * `poke.handler` in your framework.
 */
export { createPokeHandler as createPoke } from "./handler.js";
export type { PokeHandlerResult } from "./handler.js";
export type { PokeServerConfig } from "./config.js";
export type { PokeDatabase, PgQueryable, PgClient } from "./types.js";
export { buildOriginRules, matchOrigin } from "./cors.js";
export { ensureSchema, SCHEMA_SQL } from "./db.js";
