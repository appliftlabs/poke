/**
 * The slice of `pg`'s `Pool`/`Client` API Poke actually calls. Typed
 * structurally (not imported from `pg`) so `@appliftlabs/poke/server` doesn't
 * force a hard dependency on `pg` — you bring your own driver instance, same
 * as `betterAuth({ database: pool })`. A real `pg.Pool` satisfies this.
 */
/** A single connected client — no further `.connect()` of its own. */
export interface PgClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
  release: () => void;
}

export interface PgQueryable {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
  /** Optional: used for transactional writes when available (createThread). */
  connect?: () => Promise<PgClient>;
}

export type PokeDatabase = PgQueryable;
