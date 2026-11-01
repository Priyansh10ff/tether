import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { env } from "@/lib/env";

/**
 * Keep the tables bounded:
 *  - attempt response bodies are cleared after `bodyDays` (they are the bulk of the data)
 *  - delivered/discarded events older than `eventDays` are removed with their deliveries and attempts
 * Dead-lettered events are never purged automatically.
 */
export async function runRetention(db: Db, opts: { bodyDays?: number; eventDays?: number } = {}) {
  const bodyDays = opts.bodyDays ?? env().RETENTION_BODY_DAYS;
  const eventDays = opts.eventDays ?? env().RETENTION_EVENT_DAYS;

  const bodies = await db.execute(sql`
    update attempts set response_body = null
    where response_body is not null and started_at < now() - (${bodyDays} || ' days')::interval
    returning id`);

  const purged = await db.execute(sql`
    delete from events e
    where e.created_at < now() - (${eventDays} || ' days')::interval
      and not exists (select 1 from deliveries d where d.event_id = e.id and d.status in ('pending', 'in_flight', 'dead'))
    returning id`);

  return { bodiesCleared: bodies.rows.length, eventsPurged: purged.rows.length };
}
