import { eq, sql } from "drizzle-orm";
import { attempts, deliveries, endpoints, events } from "@/db/schema";
import { newId } from "@/lib/ids";
import { buildHeaders } from "@/lib/signing";
import { isRetryableStatus, isSuccessStatus, nextAttemptAt, shouldDeadLetter } from "@/lib/retry";
import { nextProbeAt, shouldOpen } from "@/lib/breaker";
import type { Db } from "@/db";
import type { ClaimedDelivery } from "./claim";

export type Fetcher = typeof fetch;

export type DispatchOutcome = {
  deliveryId: string;
  attempt: number;
  statusCode: number | null;
  ok: boolean;
  final: "succeeded" | "pending" | "dead";
  durationMs: number;
};

const BODY_LIMIT = 4096;

/** Send one claimed delivery, record the attempt, and decide what happens next. */
export async function dispatch(
  db: Db,
  d: ClaimedDelivery,
  opts: { workerId: string; timeoutMs: number; fetcher?: Fetcher; now?: () => number },
): Promise<DispatchOutcome> {
  const now = opts.now ?? Date.now;
  const fetcher = opts.fetcher ?? fetch;

  const [event, endpoint] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, d.eventId) }),
    db.query.endpoints.findFirst({ where: eq(endpoints.id, d.endpointId) }),
  ]);
  if (!event || !endpoint) throw new Error(`delivery ${d.id}: event or endpoint missing`);

  const attemptNo = d.attempt + 1;
  const body = JSON.stringify({ id: event.id, type: event.type, created_at: event.createdAt, data: event.payload });
  const secrets = [endpoint.secret];
  if (endpoint.previousSecret && endpoint.previousSecretExpiresAt && endpoint.previousSecretExpiresAt.getTime() > now()) {
    secrets.push(endpoint.previousSecret);
  }
  const headers = buildHeaders({ deliveryId: d.id, attempt: attemptNo, body, secrets, now: now() });

  const startedAt = now();
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetcher(endpoint.url, { method: "POST", headers, body, signal: ctrl.signal, redirect: "manual" });
    statusCode = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, BODY_LIMIT);
  } catch (err) {
    error = err instanceof Error ? (err.name === "AbortError" ? `timeout after ${opts.timeoutMs}ms` : err.message) : String(err);
  } finally {
    clearTimeout(timer);
  }
  const durationMs = Math.max(0, now() - startedAt);
  const ok = isSuccessStatus(statusCode);

  let final: DispatchOutcome["final"];
  if (ok) final = "succeeded";
  else if (!isRetryableStatus(statusCode) || shouldDeadLetter(attemptNo, d.maxAttempts)) final = "dead";
  else final = "pending";

  await db.transaction(async (tx) => {
    await tx.insert(attempts).values({
      id: newId.attempt(),
      deliveryId: d.id,
      number: attemptNo,
      statusCode,
      ok,
      error,
      responseBody,
      durationMs,
      workerId: opts.workerId,
      startedAt: new Date(startedAt),
    });

    const nowDate = new Date(now());
    await tx
      .update(deliveries)
      .set({
        attempt: attemptNo,
        status: final,
        lastStatusCode: statusCode,
        lastError: error ?? (ok ? null : `HTTP ${statusCode}`),
        claimedBy: null,
        claimedAt: null,
        nextAttemptAt: final === "pending" ? nextAttemptAt(attemptNo, now()) : nowDate,
        deliveredAt: ok ? nowDate : null,
        deadAt: final === "dead" ? nowDate : null,
      })
      .where(eq(deliveries.id, d.id));

    // Circuit breaker bookkeeping lives on the endpoint row.
    if (ok) {
      await tx
        .update(endpoints)
        .set({ consecutiveFailures: 0, state: sql`case when ${endpoints.state} = 'open' then 'active' else ${endpoints.state} end`, breakerOpenedAt: null, breakerProbeAt: null })
        .where(eq(endpoints.id, endpoint.id));
    } else if (statusCode === null || statusCode >= 500) {
      const failures = endpoint.consecutiveFailures + 1;
      const open = endpoint.state === "open" || shouldOpen(failures);
      await tx
        .update(endpoints)
        .set({
          consecutiveFailures: failures,
          state: open && endpoint.state !== "paused" ? "open" : endpoint.state,
          breakerOpenedAt: open ? (endpoint.breakerOpenedAt ?? nowDate) : null,
          breakerProbeAt: open ? nextProbeAt(now()) : null,
        })
        .where(eq(endpoints.id, endpoint.id));
    }
  });

  return { deliveryId: d.id, attempt: attemptNo, statusCode, ok, final, durationMs };
}
