import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { newEndpointSecret } from "@/lib/signing";
import type { Db } from "@/db";

/** In-memory Postgres via PGlite, migrated with the real migration files. */
export async function testDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

export async function seedProject(db: Db, opts: { url?: string; types?: string[] } = {}) {
  const projectId = newId.project();
  const endpointId = newId.endpoint();
  const secret = newEndpointSecret();
  await db.insert(schema.projects).values({ id: projectId, name: "Acme", slug: "acme-" + projectId.slice(-6) });
  await db.insert(schema.endpoints).values({ id: endpointId, projectId, url: opts.url ?? "https://receiver.test/hooks", secret });
  await db.insert(schema.subscriptions).values(
    (opts.types ?? ["*"]).map((eventType) => ({ id: newId.subscription(), endpointId, eventType })),
  );
  return { projectId, endpointId, secret };
}

/** A fetch stub whose behaviour you script per call; the last entry repeats. */
export function fakeFetch(script: Array<number | "timeout" | "network">) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) });
    const next = script.length > 1 ? script.shift()! : script[0];
    if (next === "timeout") { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    if (next === "network") throw new Error("ECONNREFUSED");
    return new Response(next >= 200 && next < 300 ? "ok" : "nope", { status: next });
  }) as typeof fetch;
  return { fetcher, calls };
}
