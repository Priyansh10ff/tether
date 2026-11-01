import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health          liveness: database reachable
 * GET /api/health?ready=1  readiness: database reachable, migrated, and at least one worker seen in 30s
 */
export async function GET(req: Request) {
  const ready = new URL(req.url).searchParams.get("ready") === "1";
  try {
    const t0 = Date.now();
    const [q] = (await db.execute(sql`
      select (select count(*)::int from deliveries where status = 'pending' and next_attempt_at <= now()) as due,
             (select count(*)::int from deliveries where status = 'in_flight') as in_flight,
             (select count(*)::int from workers where heartbeat_at > now() - interval '30 seconds') as workers
    `)).rows as Array<{ due: number; in_flight: number; workers: number }>;
    const body = { ok: true, db_ms: Date.now() - t0, due: q.due, in_flight: q.in_flight, workers: q.workers };
    if (ready && q.workers === 0) return NextResponse.json({ ...body, ok: false, reason: "no worker heartbeat in 30s" }, { status: 503 });
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
