import { and, desc, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deliveries, endpoints, events } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth";

export const runtime = "nodejs";

const STATUSES = new Set(["pending", "in_flight", "succeeded", "dead", "discarded"]);

/** GET /v1/deliveries?status=dead&limit=50&before=<iso> */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(db, req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "invalid or missing API key" }, { status: 401 });
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  if (status && !STATUSES.has(status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") ?? 50)));
  const before = u.searchParams.get("before");

  const rows = await db
    .select({ d: deliveries, type: events.type, url: endpoints.url })
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .where(and(eq(deliveries.projectId, auth.projectId), status ? eq(deliveries.status, status as "dead") : undefined, before ? lt(deliveries.createdAt, new Date(before)) : undefined))
    .orderBy(desc(deliveries.createdAt))
    .limit(limit);

  return NextResponse.json({
    data: rows.map(({ d, type, url }) => ({
      id: d.id,
      event_id: d.eventId,
      type,
      endpoint: { id: d.endpointId, url },
      status: d.status,
      attempt: d.attempt,
      max_attempts: d.maxAttempts,
      last_status_code: d.lastStatusCode,
      last_error: d.lastError,
      next_attempt_at: d.status === "pending" ? d.nextAttemptAt : null,
      dead_at: d.deadAt,
      created_at: d.createdAt,
    })),
    next_before: rows.length === limit ? rows[rows.length - 1].d.createdAt : null,
  });
}
