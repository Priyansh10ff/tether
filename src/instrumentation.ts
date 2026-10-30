/**
 * Optional in-process worker. Set WORKER_INLINE=1 (or use a pglite:// DATABASE_URL, which
 * cannot be shared between processes) and `next dev` / `next start` also deliver webhooks.
 * In production run `npm run worker` as its own process instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { db, isPglite } = await import("@/db");
  if (process.env.WORKER_INLINE !== "1" && !isPglite) return;
  const { startWorker } = await import("@/worker/loop");
  startWorker(db, { workerId: "inline-" + Math.random().toString(36).slice(2, 8) });
}
