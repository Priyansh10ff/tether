import { hostname } from "node:os";
import { eq, sql } from "drizzle-orm";
import { claimDeliveries, dispatch, reapStaleClaims } from "@/engine";
import { workers } from "@/db/schema";
import type { Db } from "@/db";
import { env } from "@/lib/env";

export type WorkerOptions = {
  concurrency?: number;
  pollMs?: number;
  timeoutMs?: number;
  workerId?: string;
  log?: (line: string) => void;
};

/** The delivery loop. Returns a stop() that resolves once the current tick finishes. */
export function startWorker(db: Db, opts: WorkerOptions = {}) {
  const cfg = env();
  const concurrency = opts.concurrency ?? cfg.WORKER_CONCURRENCY;
  const pollMs = opts.pollMs ?? cfg.WORKER_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? cfg.DELIVERY_TIMEOUT_MS;
  const leaseMs = timeoutMs * 2 + 5000;
  const workerId = opts.workerId ?? `${hostname()}-${process.pid}`;
  const log = opts.log ?? console.log;
  let stopping = false;
  let lastReap = 0;
  let lastBeat = 0;
  let delivered = 0, failed = 0;

  async function heartbeat() {
    await db
      .insert(workers)
      .values({ id: workerId, hostname: hostname(), concurrency, delivered, failed })
      .onConflictDoUpdate({ target: workers.id, set: { heartbeatAt: sql`now()`, delivered, failed, concurrency } });
    lastBeat = Date.now();
  }

  async function tick() {
    const claimed = await claimDeliveries(db, workerId, concurrency);
    if (!claimed.length) return 0;
    await Promise.all(
      claimed.map(async (d) => {
        try {
          const out = await dispatch(db, d, { workerId, timeoutMs });
          if (out.ok) delivered++; else failed++;
          log(`${out.deliveryId} attempt ${out.attempt} -> ${out.statusCode ?? "error"} ${out.final} (${out.durationMs}ms)`);
        } catch (err) {
          console.error(`${d.id} dispatch failed`, err);
        }
      }),
    );
    return claimed.length;
  }

  const done = (async () => {
    log(`tether worker ${workerId} · concurrency ${concurrency} · poll ${pollMs}ms`);
    while (!stopping) {
      try {
        if (Date.now() - lastBeat > 5_000) await heartbeat();
        if (Date.now() - lastReap > 30_000) {
          const n = await reapStaleClaims(db, leaseMs);
          if (n) log(`reaped ${n} stale claims`);
          lastReap = Date.now();
        }
        const n = await tick();
        if (n === 0) await new Promise((r) => setTimeout(r, pollMs));
      } catch (err) {
        console.error("worker tick failed", err);
        await new Promise((r) => setTimeout(r, pollMs * 4));
      }
    }
  })();

  return {
    workerId,
    stop: async () => {
      stopping = true;
      await done;
      await db.delete(workers).where(eq(workers.id, workerId)).catch(() => {});
    },
  };
}
