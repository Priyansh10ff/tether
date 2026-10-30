import { hostname } from "node:os";
import { claimDeliveries, dispatch, reapStaleClaims } from "@/engine";
import type { Db } from "@/db";

export type WorkerOptions = {
  concurrency?: number;
  pollMs?: number;
  timeoutMs?: number;
  workerId?: string;
  log?: (line: string) => void;
};

/** The delivery loop. Returns a stop() that resolves once the current tick finishes. */
export function startWorker(db: Db, opts: WorkerOptions = {}) {
  const concurrency = opts.concurrency ?? Number(process.env.WORKER_CONCURRENCY ?? 8);
  const pollMs = opts.pollMs ?? Number(process.env.WORKER_POLL_MS ?? 500);
  const timeoutMs = opts.timeoutMs ?? Number(process.env.DELIVERY_TIMEOUT_MS ?? 8000);
  const leaseMs = timeoutMs * 2 + 5000;
  const workerId = opts.workerId ?? `${hostname()}-${process.pid}`;
  const log = opts.log ?? console.log;
  let stopping = false;
  let lastReap = 0;

  async function tick() {
    const claimed = await claimDeliveries(db, workerId, concurrency);
    if (!claimed.length) return 0;
    await Promise.all(
      claimed.map(async (d) => {
        try {
          const out = await dispatch(db, d, { workerId, timeoutMs });
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

  return { workerId, stop: () => { stopping = true; return done; } };
}
