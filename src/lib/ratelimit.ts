/**
 * Fixed-window in-memory limiter. Good enough for login brute-force protection on a
 * single admin dashboard; API ingest limits live in Postgres per endpoint instead.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  return { allowed: b.count <= max, remaining: Math.max(0, max - b.count), retryAfterMs: b.resetAt - now };
}

export function resetRateLimits() {
  buckets.clear();
}
