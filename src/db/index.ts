import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://tether:tether@localhost:5432/tether";

// One pool per process. Next.js hot reload re-evaluates modules, so stash it on globalThis in dev.
const g = globalThis as unknown as { __tetherPool?: Pool };
export const pool = g.__tetherPool ?? new Pool({ connectionString: url, max: 10 });
if (process.env.NODE_ENV !== "production") g.__tetherPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
