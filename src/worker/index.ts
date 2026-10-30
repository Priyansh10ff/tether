import { hostname } from "node:os";
import { db, pool } from "@/db";
import { claimDeliveries, dispatch, reapStaleClaims } from "@/engine";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 8);
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 500);
const TIMEOUT_MS = Number(process.env.DELIVERY_TIMEOUT_MS ?? 8000);
const LEASE_MS = TIMEOUT_MS * 2 + 5000;

const workerId = `${hostname()}-${process.pid}`;
let stopping = false;

async function tick() {
  const claimed = await claimDeliveries(db, workerId, CONCURRENCY);
  if (!claimed.length) return 0;
  await Promise.all(
    claimed.map(async (d) => {
      try {
        const out = await dispatch(db, d, { workerId, timeoutMs: TIMEOUT_MS });
        console.log(`${out.deliveryId} attempt ${out.attempt} -> ${out.statusCode ?? "error"} ${out.final} (${out.durationMs}ms)`);
      } catch (err) {
        console.error(`${d.id} dispatch failed`, err);
      }
    }),
  );
  return claimed.length;
}

async function main() {
  console.log(`tether worker ${workerId} · concurrency ${CONCURRENCY} · poll ${POLL_MS}ms`);
  let lastReap = 0;
  while (!stopping) {
    if (Date.now() - lastReap > 30_000) {
      const n = await reapStaleClaims(db, LEASE_MS);
      if (n) console.log(`reaped ${n} stale claims`);
      lastReap = Date.now();
    }
    const n = await tick();
    if (n === 0) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await pool.end();
}

process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
