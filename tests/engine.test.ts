import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { attempts, deliveries, endpoints, events } from "@/db/schema";
import { claimDeliveries, dispatch, ingestEvent } from "@/engine";
import { verifySignature } from "@/lib/signing";
import { fakeFetch, seedProject, testDb } from "./helpers/db";
import type { Db } from "@/db";

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

describe("ingest", () => {
  it("stores the event once and fans out to matching endpoints", async () => {
    const { projectId } = await seedProject(db, { types: ["order.*"] });
    const r = await ingestEvent(db, { projectId, type: "order.paid", payload: { amount: 1 } });
    expect(r.status).toBe("created");
    const rows = await db.select().from(deliveries);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("does not deliver to endpoints that are not subscribed", async () => {
    const { projectId } = await seedProject(db, { types: ["invoice.*"] });
    const r = await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
    expect(r).toMatchObject({ status: "created", deliveries: 0 });
  });

  it("deduplicates on idempotency key", async () => {
    const { projectId } = await seedProject(db);
    const a = await ingestEvent(db, { projectId, type: "order.paid", payload: {}, idempotencyKey: "k1" });
    const b = await ingestEvent(db, { projectId, type: "order.paid", payload: {}, idempotencyKey: "k1" });
    expect(a.status).toBe("created");
    expect(b).toEqual({ status: "duplicate", eventId: (a as { eventId: string }).eventId });
    expect(await db.select().from(events)).toHaveLength(1);
  });

  it("rejects malformed types", async () => {
    const { projectId } = await seedProject(db);
    expect((await ingestEvent(db, { projectId, type: "Order Paid", payload: {} })).status).toBe("invalid");
  });
});

describe("claim + dispatch", () => {
  it("delivers a signed request and marks the delivery succeeded", async () => {
    const { projectId, secret } = await seedProject(db);
    await ingestEvent(db, { projectId, type: "order.paid", payload: { n: 1 } });
    const { fetcher, calls } = fakeFetch([200]);

    const claimed = await claimDeliveries(db, "w1", 10);
    expect(claimed).toHaveLength(1);
    expect(await claimDeliveries(db, "w2", 10)).toHaveLength(0); // already in flight

    const out = await dispatch(db, claimed[0], { workerId: "w1", timeoutMs: 1000, fetcher });
    expect(out).toMatchObject({ ok: true, final: "succeeded", statusCode: 200, attempt: 1 });

    const call = calls[0];
    expect(call.headers["tether-attempt"]).toBe("1");
    expect(verifySignature({ secret, body: call.body, timestamp: call.headers["tether-timestamp"], signature: call.headers["tether-signature"] }).ok).toBe(true);

    const [d] = await db.select().from(deliveries);
    expect(d.status).toBe("succeeded");
    expect(d.attempt).toBe(1);
    expect(await db.select().from(attempts)).toHaveLength(1);
  });

  it("retries a 503 with backoff and dead-letters after the last attempt", async () => {
    const { projectId, endpointId } = await seedProject(db);
    await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
    const { fetcher } = fakeFetch([503]);
    let clock = Date.now();
    const now = () => clock;

    for (let i = 1; i <= 7; i++) {
      await db.update(deliveries).set({ nextAttemptAt: new Date(0) }); // make it due
      const [c] = await claimDeliveries(db, "w1", 1);
      expect(c, `attempt ${i} should be claimable`).toBeTruthy();
      const out = await dispatch(db, c, { workerId: "w1", timeoutMs: 1000, fetcher, now });
      expect(out.statusCode).toBe(503);
      expect(out.final).toBe(i < 7 ? "pending" : "dead");
      if (i < 7) {
        const [d] = await db.select().from(deliveries);
        expect(d.nextAttemptAt.getTime()).toBeGreaterThan(clock);
      }
      clock += 1000;
    }
    const [d] = await db.select().from(deliveries);
    expect(d.status).toBe("dead");
    expect(d.deadAt).toBeTruthy();
    expect(await db.select().from(attempts)).toHaveLength(7);
    const [ep] = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
    expect(ep.consecutiveFailures).toBe(7);
  });

  it("does not retry a 4xx", async () => {
    const { projectId } = await seedProject(db);
    await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
    const { fetcher } = fakeFetch([404]);
    const [c] = await claimDeliveries(db, "w1", 1);
    const out = await dispatch(db, c, { workerId: "w1", timeoutMs: 1000, fetcher });
    expect(out.final).toBe("dead");
  });

  it("records a timeout as an attempt and schedules a retry", async () => {
    const { projectId } = await seedProject(db);
    await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
    const { fetcher } = fakeFetch(["timeout"]);
    const [c] = await claimDeliveries(db, "w1", 1);
    const out = await dispatch(db, c, { workerId: "w1", timeoutMs: 50, fetcher });
    expect(out).toMatchObject({ statusCode: null, final: "pending" });
    const [a] = await db.select().from(attempts);
    expect(a.error).toMatch(/timeout|aborted/);
  });

  it("keeps deliveries with the same ordering key in order", async () => {
    const { projectId } = await seedProject(db);
    await ingestEvent(db, { projectId, type: "order.created", payload: {}, orderingKey: "cust_1" });
    await ingestEvent(db, { projectId, type: "order.paid", payload: {}, orderingKey: "cust_1" });
    await ingestEvent(db, { projectId, type: "order.paid", payload: {}, orderingKey: "cust_2" });

    const first = await claimDeliveries(db, "w1", 10);
    expect(first.map((d) => d.orderingKey).sort()).toEqual(["cust_1", "cust_2"]);
    const { fetcher } = fakeFetch([200]);
    for (const d of first) await dispatch(db, d, { workerId: "w1", timeoutMs: 1000, fetcher });
    const second = await claimDeliveries(db, "w1", 10);
    expect(second).toHaveLength(1);
    expect(second[0].orderingKey).toBe("cust_1");
  });
});
