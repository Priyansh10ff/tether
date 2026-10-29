import { and, eq, isNull } from "drizzle-orm";
import { endpoints, events, deliveries, subscriptions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/retry";
import { topicMatches, isValidEventType } from "@/lib/topics";
import type { Db } from "@/db";

export type IngestInput = {
  projectId: string;
  type: string;
  payload: unknown;
  idempotencyKey?: string | null;
  orderingKey?: string | null;
};

export type IngestResult =
  | { status: "created"; eventId: string; deliveries: number }
  | { status: "duplicate"; eventId: string }
  | { status: "invalid"; error: string };

/**
 * Store the event once and create one delivery per subscribed, non-paused endpoint,
 * all inside one transaction. A repeated idempotency key returns the original event.
 */
export async function ingestEvent(db: Db, input: IngestInput): Promise<IngestResult> {
  if (!isValidEventType(input.type)) return { status: "invalid", error: "type must look like 'order.paid'" };

  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.query.events.findFirst({
        where: and(eq(events.projectId, input.projectId), eq(events.idempotencyKey, input.idempotencyKey)),
        columns: { id: true },
      });
      if (existing) return { status: "duplicate" as const, eventId: existing.id };
    }

    const eventId = newId.event();
    await tx.insert(events).values({
      id: eventId,
      projectId: input.projectId,
      type: input.type,
      payload: input.payload as object,
      idempotencyKey: input.idempotencyKey ?? null,
      orderingKey: input.orderingKey ?? null,
    });

    const candidates = await tx
      .select({ endpointId: endpoints.id, pattern: subscriptions.eventType, state: endpoints.state })
      .from(subscriptions)
      .innerJoin(endpoints, eq(subscriptions.endpointId, endpoints.id))
      .where(and(eq(endpoints.projectId, input.projectId), isNull(endpoints.breakerOpenedAt)));

    const targets = new Set<string>();
    for (const c of candidates) {
      if (c.state === "paused") continue;
      if (topicMatches(c.pattern, input.type)) targets.add(c.endpointId);
    }
    // Endpoints with an open breaker still get the delivery row; the worker skips them until the probe succeeds.
    const open = await tx
      .select({ endpointId: endpoints.id, pattern: subscriptions.eventType })
      .from(subscriptions)
      .innerJoin(endpoints, eq(subscriptions.endpointId, endpoints.id))
      .where(and(eq(endpoints.projectId, input.projectId), eq(endpoints.state, "open")));
    for (const c of open) if (topicMatches(c.pattern, input.type)) targets.add(c.endpointId);

    if (targets.size) {
      await tx.insert(deliveries).values(
        [...targets].map((endpointId) => ({
          id: newId.delivery(),
          projectId: input.projectId,
          eventId,
          endpointId,
          orderingKey: input.orderingKey ?? null,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
        })),
      );
    }
    return { status: "created" as const, eventId, deliveries: targets.size };
  });
}
