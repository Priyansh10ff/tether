import { sql } from "drizzle-orm";
import type { Db } from "@/db";

export type ClaimedDelivery = {
  id: string;
  projectId: string;
  eventId: string;
  endpointId: string;
  attempt: number;
  maxAttempts: number;
  orderingKey: string | null;
};

/**
 * Claim up to `limit` due deliveries for this worker.
 *
 * FOR UPDATE SKIP LOCKED lets many workers poll the same table without fighting
 * over rows. A worker that dies mid-send never commits; its row stays `in_flight`
 * until the reaper (below) hands it back after the lease expires.
 *
 * Ordering: a delivery with an ordering key is only claimable if no earlier delivery
 * for the same endpoint+key is still pending or in flight.
 */
export async function claimDeliveries(db: Db, workerId: string, limit: number): Promise<ClaimedDelivery[]> {
  const rows = await db.execute(sql`
    with due as (
      select d.id
      from deliveries d
      join endpoints e on e.id = d.endpoint_id
      where d.status = 'pending'
        and d.next_attempt_at <= now()
        and e.state <> 'paused'
        and (e.state <> 'open' or e.breaker_probe_at is null or e.breaker_probe_at <= now())
        and (
          d.ordering_key is null
          or not exists (
            select 1 from deliveries p
            where p.endpoint_id = d.endpoint_id
              and p.ordering_key = d.ordering_key
              and p.created_at < d.created_at
              and p.status in ('pending', 'in_flight')
          )
        )
      order by d.next_attempt_at
      limit ${limit}
      for update of d skip locked
    )
    update deliveries d
    set status = 'in_flight', claimed_by = ${workerId}, claimed_at = now()
    from due
    where d.id = due.id
    returning d.id, d.project_id as "projectId", d.event_id as "eventId", d.endpoint_id as "endpointId",
              d.attempt, d.max_attempts as "maxAttempts", d.ordering_key as "orderingKey"
  `);
  return rows.rows as ClaimedDelivery[];
}

/** Hand back deliveries whose worker vanished. Lease = 2x the delivery timeout plus slack. */
export async function reapStaleClaims(db: Db, leaseMs: number) {
  const res = await db.execute(sql`
    update deliveries
    set status = 'pending', claimed_by = null, claimed_at = null
    where status = 'in_flight' and claimed_at < now() - (${leaseMs} || ' milliseconds')::interval
  `);
  return res.rowCount ?? 0;
}
