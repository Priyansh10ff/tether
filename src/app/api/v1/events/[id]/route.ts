import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { attempts, deliveries, endpoints, events } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /v1/events/:id — the event, its deliveries and every attempt. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(db, req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "invalid or missing API key" }, { status: 401 });
  const { id } = await ctx.params;
  const event = await db.query.events.findFirst({ where: and(eq(events.id, id), eq(events.projectId, auth.projectId)) });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dls = await db
    .select({ d: deliveries, url: endpoints.url })
    .from(deliveries)
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .where(eq(deliveries.eventId, id))
    .orderBy(asc(deliveries.createdAt));
  const out = [];
  for (const { d, url } of dls) {
    const atts = await db.select().from(attempts).where(eq(attempts.deliveryId, d.id)).orderBy(asc(attempts.number));
    out.push({
      id: d.id,
      endpoint: { id: d.endpointId, url },
      status: d.status,
      attempt: d.attempt,
      max_attempts: d.maxAttempts,
      next_attempt_at: d.status === "pending" ? d.nextAttemptAt : null,
      delivered_at: d.deliveredAt,
      dead_at: d.deadAt,
      attempts: atts.map((a) => ({ number: a.number, status_code: a.statusCode, ok: a.ok, error: a.error, duration_ms: a.durationMs, started_at: a.startedAt })),
    });
  }
  return NextResponse.json({
    id: event.id,
    type: event.type,
    created_at: event.createdAt,
    idempotency_key: event.idempotencyKey,
    ordering_key: event.orderingKey,
    data: event.payload,
    deliveries: out,
  });
}
