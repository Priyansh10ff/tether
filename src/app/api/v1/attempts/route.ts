import { and, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { attempts, deliveries, endpoints, events } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /v1/attempts?since=<iso>&limit=100 — newest first. Used by `tether tail`. */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(db, req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "invalid or missing API key" }, { status: 401 });
  const u = new URL(req.url);
  const since = u.searchParams.get("since");
  const limit = Math.min(500, Math.max(1, Number(u.searchParams.get("limit") ?? 100)));

  const rows = await db
    .select({ id: attempts.id, delivery_id: attempts.deliveryId, event_id: events.id, type: events.type, url: endpoints.url, number: attempts.number, status_code: attempts.statusCode, ok: attempts.ok, error: attempts.error, duration_ms: attempts.durationMs, worker: attempts.workerId, started_at: attempts.startedAt })
    .from(attempts)
    .innerJoin(deliveries, eq(deliveries.id, attempts.deliveryId))
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .where(and(eq(deliveries.projectId, auth.projectId), since ? gt(attempts.startedAt, new Date(since)) : undefined))
    .orderBy(desc(attempts.startedAt))
    .limit(limit);
  return NextResponse.json({ data: rows });
}
