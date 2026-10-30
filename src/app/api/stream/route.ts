import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { attempts, deliveries, endpoints, events } from "@/db/schema";
import { isAuthenticated } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-sent events: new attempts for a project, polled from Postgres every second.
 * Polling keeps the dashboard free of LISTEN/NOTIFY plumbing and works on pooled connections.
 */
export async function GET(req: Request) {
  if (!(await isAuthenticated())) return new Response("unauthorized", { status: 401 });
  const projectId = new URL(req.url).searchParams.get("project");
  if (!projectId) return new Response("project required", { status: 400 });

  const enc = new TextEncoder();
  let since = new Date();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      controller.enqueue(enc.encode(": connected\n\n"));
      while (!closed) {
        try {
          const rows = await db
            .select({ id: attempts.id, at: attempts.startedAt, code: attempts.statusCode, ok: attempts.ok, ms: attempts.durationMs, number: attempts.number, error: attempts.error, type: events.type, url: endpoints.url, eventId: events.id })
            .from(attempts)
            .innerJoin(deliveries, eq(deliveries.id, attempts.deliveryId))
            .innerJoin(events, eq(events.id, deliveries.eventId))
            .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
            .where(and(eq(deliveries.projectId, projectId), gt(attempts.startedAt, since)))
            .orderBy(desc(attempts.startedAt))
            .limit(50);
          if (rows.length) {
            since = rows[0].at;
            for (const r of rows.reverse()) send(r);
          } else {
            controller.enqueue(enc.encode(": ping\n\n"));
          }
        } catch {
          closed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      try { controller.close(); } catch {}
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
