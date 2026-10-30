import { sql } from "drizzle-orm";
import { db } from "@/db";

export type DbStatus = { ok: true } | { ok: false; reason: "unreachable" | "auth" | "no_tables" | "unknown"; detail: string; target: string };

/** One cheap query that tells the dashboard whether Postgres is reachable and migrated. */
export async function checkDb(): Promise<DbStatus> {
  const url = process.env.DATABASE_URL ?? "postgres://tether:tether@localhost:5433/tether";
  const target = url.startsWith("pglite://") ? url : url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
  try {
    await db.execute(sql`select 1 from projects limit 1`);
    return { ok: true };
  } catch (e) {
    const err = e as { message?: string; code?: string; cause?: { code?: string; message?: string; errors?: { code?: string }[] } };
    const codes = [err.code, err.cause?.code, ...(err.cause?.errors ?? []).map((x) => x.code)].filter(Boolean).join(",");
    const msg = `${err.message ?? ""} ${err.cause?.message ?? ""} ${codes}`;
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|not iterable/i.test(msg)) return { ok: false, reason: "unreachable", detail: codes || "connection refused", target };
    if (/28P01|password authentication/i.test(msg)) return { ok: false, reason: "auth", detail: "password authentication failed", target };
    if (/42P01|does not exist/i.test(msg)) return { ok: false, reason: "no_tables", detail: "tables missing", target };
    return { ok: false, reason: "unknown", detail: (err.message ?? String(e)).slice(0, 300), target };
  }
}
