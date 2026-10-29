/**
 * Retry schedule. Attempt 1 is immediate; each failure schedules the next one after
 * the corresponding delay with ±20% jitter so a burst of failures spreads out.
 *
 *   attempt:  1    2     3     4      5      6     7
 *   delay:    0   5s   30s    2m    10m     1h    6h   -> dead-letter after 7
 */
export const DEFAULT_SCHEDULE_SECONDS = [0, 5, 30, 120, 600, 3600, 21600];
export const DEFAULT_MAX_ATTEMPTS = DEFAULT_SCHEDULE_SECONDS.length;
export const JITTER = 0.2;

export function delayForAttempt(attempt: number, schedule = DEFAULT_SCHEDULE_SECONDS) {
  // attempt = the number of the attempt about to be made (1-based)
  const idx = Math.min(Math.max(attempt - 1, 0), schedule.length - 1);
  return schedule[idx];
}

export function withJitter(seconds: number, rand = Math.random, jitter = JITTER) {
  if (seconds === 0) return 0;
  const factor = 1 + (rand() * 2 - 1) * jitter;
  return Math.max(1, Math.round(seconds * factor));
}

export function nextAttemptAt(attemptsMade: number, now = Date.now(), rand = Math.random) {
  const seconds = withJitter(delayForAttempt(attemptsMade + 1), rand);
  return new Date(now + seconds * 1000);
}

export function shouldDeadLetter(attemptsMade: number, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  return attemptsMade >= maxAttempts;
}

// 2xx is success. 3xx is a misconfiguration, not worth retrying. 4xx is the receiver rejecting us:
// retrying 400/401/403/404/410/422 will not help, but 408/425/429 are transient.
export function isRetryableStatus(status: number | null) {
  if (status === null) return true; // network error / timeout
  if (status >= 200 && status < 300) return false;
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 400 && status < 500) return false;
  return true;
}

export function isSuccessStatus(status: number | null) {
  return status !== null && status >= 200 && status < 300;
}
