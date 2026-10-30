/**
 * Circuit breaker per endpoint.
 * After THRESHOLD consecutive failures (5xx or network/timeout) the endpoint is marked `open`.
 * While open, the worker sends one probe delivery per PROBE_INTERVAL. The first 2xx closes it.
 */
export const BREAKER_THRESHOLD = Number(process.env.BREAKER_THRESHOLD ?? 10);
export const BREAKER_PROBE_MS = Number(process.env.BREAKER_PROBE_MS ?? 60_000);

export function shouldOpen(consecutiveFailures: number, threshold = BREAKER_THRESHOLD) {
  return consecutiveFailures >= threshold;
}

export function nextProbeAt(now = Date.now(), interval = BREAKER_PROBE_MS) {
  return new Date(now + interval);
}
