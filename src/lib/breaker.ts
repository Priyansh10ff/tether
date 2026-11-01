/**
 * Circuit breaker per endpoint.
 * After THRESHOLD consecutive failures (5xx or network/timeout) the endpoint is marked `open`.
 * While open, the worker sends one probe delivery per PROBE_INTERVAL. The first 2xx closes it.
 */
import { env } from "./env";

export const BREAKER_THRESHOLD = env().BREAKER_THRESHOLD;
export const BREAKER_PROBE_MS = env().BREAKER_PROBE_MS;

export function shouldOpen(consecutiveFailures: number, threshold = BREAKER_THRESHOLD) {
  return consecutiveFailures >= threshold;
}

export function nextProbeAt(now = Date.now(), interval = BREAKER_PROBE_MS) {
  return new Date(now + interval);
}
