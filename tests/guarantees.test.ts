import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { attempts, deliveries, endpoints } from "@/db/schema";
import { claimDeliveries, dispatch, ingestEvent, reapStaleClaims } from "@/engine";
import { BREAKER_THRESHOLD } from "@/lib/breaker";
import { fakeFetch, seedProject, testDb } from "./helpers/db";
import type { Db } from "@/db";

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

async function due() {
  await db.update(deliveries).set({ nextAttemptAt: new Date(0) });
}

describe("circuit breaker", () => {
  it("opens after the threshold and lets one probe through per window", async () => {
    const { projectId, endpointId } = await seedProject(db);
    for (let i = 0; i < BREAKER_THRESHOLD + 3; i++) await ingestEvent(db, { projectId, type: "order.paid", payload: { i } });
    const { fetcher } = fakeFetch([503]);
    const clock = Date.now();
    const now = () => clock;

    // Burn through the threshold: each claimed delivery fails once.
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      const [c] = await claimDeliveries(db, "w", 1);
      await dispatch(db, c, { workerId: "w", timeoutMs: 100, fetcher, now });
    }
    const [ep] = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
    expect(ep.state).toBe("open");
    expect(ep.breakerProbeAt!.getTime()).toBeGreaterThan(clock);

    // Open + probe not yet due: nothing is claimable even though deliveries are pending.
    await due();
    expect(await claimDeliveries(db, "w", 10)).toHaveLength(0);

    // Probe due: exactly one delivery comes out.
    await db.update(endpoints).set({ breakerProbeAt: new Date(0) }).where(eq(endpoints.id, endpointId));
    const probe = await claimDeliveries(db, "w", 10);
    expect(probe).toHaveLength(1);

    // Probe succeeds: breaker closes and everything flows again.
    const { fetcher: okFetch } = fakeFetch([200]);
    await dispatch(db, probe[0], { workerId: "w", timeoutMs: 100, fetcher: okFetch, now });
    const [after] = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
    expect(after.state).toBe("active");
    expect(after.consecutiveFailures).toBe(0);
    await due();
    expect((await claimDeliveries(db, "w", 50)).length).toBeGreaterThan(1);
  });

  it("a failed probe pushes the window forward", async () => {
    const { projectId, endpointId } = await seedProject(db);
    await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
    await db.update(endpoints).set({ state: "open", consecutiveFailures: 10, breakerOpenedAt: new Date(), breakerProbeAt: new Date(0) }).where(eq(endpoints.id, endpointId));
    const [c] = await claimDeliveries(db, "w", 10);
    const { fetcher } = fakeFetch([503]);
    await dispatch(db, c, { workerId: "w", timeoutMs: 100, fetcher });
    const [ep] = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
    expect(ep.state).toBe("open");
    expect(ep.breakerProbeAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("rate limit", () => {
  it("claims at most rate_limit_per_second deliveries per endpoint per second", async () => {
    const { projectId, endpointId } = await seedProject(db);
    await db.update(endpoints).set({ rateLimitPerSecond: 3 }).where(eq(endpoints.id, endpointId));
    for (let i = 0; i < 10; i++) await ingestEvent(db, { projectId, type: "order.paid", payload: { i } });

    const first = await claimDeliveries(db, "w", 50);
    expect(first).toHaveLength(3);
    // Those three are in flight, so the budget is spent until they finish and age out.
    expect(await claimDeliveries(db, "w", 50)).toHaveLength(0);

    const { fetcher } = fakeFetch([200]);
    for (const c of first) await dispatch(db, c, { workerId: "w", timeoutMs: 100, fetcher });
    // Attempts in the last second still count.
    expect(await claimDeliveries(db, "w", 50)).toHaveLength(0);
    // Age the attempts out of the window.
    await db.update(attempts).set({ startedAt: new Date(Date.now() - 5000) });
    expect(await claimDeliveries(db, "w", 50)).toHaveLength(3);
  });

  it("does not limit endpoints without a rate limit", async () => {
    const { projectId } = await seedProject(db);
    for (let i = 0; i < 10; i++) await ingestEvent(db, { projectId, type: "order.paid", payload: { i } });
    expect(await claimDeliveries(db, "w", 50)).toHaveLength(10);
  });
});

describe("stale claims", () => {
  it("returns in-flight rows whose worker disappeared", async () => {
    const { projectId } = await seedProject(db);
    await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
    const [c] = await claimDeliveries(db, "w-crashed", 1);
    expect(c).toBeTruthy();
    expect(await reapStaleClaims(db, 60_000)).toBe(0); // lease not expired
    await db.update(deliveries).set({ claimedAt: new Date(Date.now() - 120_000) });
    expect(await reapStaleClaims(db, 60_000)).toBe(1);
    expect(await claimDeliveries(db, "w-2", 1)).toHaveLength(1);
  });
});

describe("per-endpoint max attempts", () => {
  it("dead-letters after the endpoint's own limit", async () => {
    const { projectId, endpointId } = await seedProject(db);
    await db.update(endpoints).set({ maxAttempts: 2 }).where(eq(endpoints.id, endpointId));
    await ingestEvent(db, { projectId, type: "order.paid", payload: {} });
    const { fetcher } = fakeFetch([503]);
    let out;
    for (let i = 0; i < 2; i++) {
      await due();
      const [c] = await claimDeliveries(db, "w", 1);
      out = await dispatch(db, c, { workerId: "w", timeoutMs: 100, fetcher });
    }
    expect(out!.final).toBe("dead");
    expect(out!.attempt).toBe(2);
  });
});
