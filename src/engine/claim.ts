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
 * until reapStaleClaims hands it back after the lease expires.
 *
 * Per-endpoint rules applied here, in SQL, so they hold across every worker:
 *  - ordering: a keyed delivery waits for earlier deliveries with the same endpoint+key
 *  - breaker: an `open` endpoint gets exactly one probe delivery per probe window
 *  - rate limit: attempts in the last second + rows in flight must stay under rate_limit_per_second
 */
export async function claimDeliveries(db: Db, workerId: string, limit: number): Promise<ClaimedDelivery[]> {
  const rows = await db.execute(sql`
    with cand as (
      select d.id,
             e.state,
             e.rate_limit_per_second as rl,
             row_number() over (partition by d.endpoint_id order by d.next_attempt_at, d.created_at) as rn,
             (select count(*) from deliveries f where f.endpoint_id = d.endpoint_id and f.status = 'in_flight')
             + (select count(*) from attempts a join deliveries dd on dd.id = a.delivery_id
                 where dd.endpoint_id = d.endpoint_id and a.started_at > now() - interval '1 second') as used
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
    ),
    due as (
      select d.id, d.next_attempt_at
      from deliveries d
      where d.id in (
        select id from cand
        where (state <> 'open' or rn = 1)
          and (rl is null or rn <= rl - used)
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
    returning id
  `);
  return res.rows.length;
}

