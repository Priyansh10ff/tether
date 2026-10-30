import * as schema from "./schema";

/**
 * DATABASE_URL decides the driver:
 *   postgres://…        node-postgres pool (production, docker compose)
 *   pglite://./.data    embedded Postgres in a directory, no server needed (quick local trial;
 *                       single process only, so run the worker in-process with WORKER_INLINE=1)
 */
const url = process.env.DATABASE_URL ?? "postgres://tether:tether@localhost:5433/tether";
export const isPglite = url.startsWith("pglite://");

type PgDb = import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema>;
export type Db = PgDb;

const g = globalThis as unknown as { __tetherDb?: Db; __tetherClose?: () => Promise<void> };

function create(): { db: Db; close: () => Promise<void> } {
  if (isPglite) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
    const client = new PGlite(url.slice("pglite://".length) || "./.tether-data");
    return { db: drizzle(client, { schema }) as unknown as Db, close: () => client.close() };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg") as typeof import("pg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

// One connection pool per process. Next.js hot reload re-evaluates modules, so stash it on globalThis in dev.
if (!g.__tetherDb) {
  const c = create();
  g.__tetherDb = c.db;
  g.__tetherClose = c.close;
}
export const db = g.__tetherDb!;
export const closeDb = () => g.__tetherClose!();
export { schema };
