import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { attempts, deliveries, events } from "@/db/schema";
import { claimDeliveries, dispatch, ingestEvent, runRetention } from "@/engine";
import { fakeFetch, seedProject, testDb } from "./helpers/db";

it("clears old bodies and purges old delivered events but never dead ones", async () => {
  const db = await testDb();
  const { projectId } = await seedProject(db);
  await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
  await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
  const claimed = await claimDeliveries(db, "w", 10);
  const { fetcher } = fakeFetch([200]);
  await dispatch(db, claimed[0], { workerId: "w", timeoutMs: 100, fetcher });
  const { fetcher: bad } = fakeFetch([404]);
  await dispatch(db, claimed[1], { workerId: "w", timeoutMs: 100, fetcher: bad }); // dead

  // Age everything by 40 days.
  await db.execute(sql`update events set created_at = now() - interval '40 days'`);
  await db.execute(sql`update attempts set started_at = now() - interval '40 days'`);

  const r = await runRetention(db, { bodyDays: 7, eventDays: 30 });
  expect(r.bodiesCleared).toBe(2);
  expect(r.eventsPurged).toBe(1);
  expect(await db.select().from(events)).toHaveLength(1);
  const [d] = await db.select().from(deliveries);
  expect(d.status).toBe("dead");
  const atts = await db.select().from(attempts);
  expect(atts.every((a) => a.responseBody === null)).toBe(true);
});
