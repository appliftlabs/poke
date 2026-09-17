import type { PokeUser } from "../core/types.js";
import type { PokeDatabase } from "./types.js";

export interface PokeServerConfig {
  /**
   * Your Postgres connection — a `pg.Pool` (or anything with the same `query`
   * method: `db.query(text, values) -> { rows }`). Bring your own instance,
   * same as `betterAuth({ database: pool })`.
   */
  database: PokeDatabase;

  /**
   * Who's making this request. Called on every write (creating a thread,
   * replying, editing). Return `null`/`undefined` to reject with 401, unless
   * `allowAnonymous` is set — then the request's own `author` field is trusted
   * instead (only appropriate for an internal/trusted audience; see the
   * "No auth" note in the docs).
   *
   * This is where real auth plugs in — read your session/cookie/JWT here:
   *
   *   getUser: async (req) => {
   *     const session = await auth.getSession(req);
   *     return session && { id: session.user.id, name: session.user.name };
   *   }
   */
  getUser?: (req: Request) => Promise<PokeUser | null> | PokeUser | null;

  /**
   * Trust the `author` a request body supplies instead of requiring
   * `getUser`. Only for a trusted/internal audience — anyone who can reach
   * this endpoint can claim to be anyone. Default false.
   */
  allowAnonymous?: boolean;

  /**
   * Logical namespace for this deployment's comments — lets one database serve
   * multiple apps/environments without their comments mixing. Default "default".
   */
  project?: string;

  /**
   * Allowed browser origins for CORS. Comma-separated string or array. Each
   * entry: `*` (any — internal use only), an exact origin, or
   * `https://*.example.com` (one subdomain label). Default `"*"`.
   */
  origins?: string | string[];

  /** Max request body size in bytes. Default 100_000. */
  maxBodyBytes?: number;

  /**
   * Enable the SSE realtime endpoint. Default true. Turn off on platforms where
   * long-lived connections don't work (some serverless/edge runtimes) — reads
   * still work, viewers just won't get live push (poll on your own schedule, or
   * rely on next navigation to refresh).
   */
  realtime?: boolean;
}

export interface ResolvedPokeServerConfig extends PokeServerConfig {
  project: string;
  maxBodyBytes: number;
  realtime: boolean;
}

export function resolveConfig(config: PokeServerConfig): ResolvedPokeServerConfig {
  if (!config.database) {
    throw new Error("[poke] createPoke() requires a `database`.");
  }
  return {
    ...config,
    project: config.project ?? "default",
    maxBodyBytes: config.maxBodyBytes ?? 100_000,
    realtime: config.realtime ?? true,
  };
}
