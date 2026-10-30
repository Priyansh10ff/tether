import { describe, expect, it } from "vitest";
import { delayForAttempt, isRetryableStatus, nextAttemptAt, shouldDeadLetter, withJitter } from "@/lib/retry";

describe("retry schedule", () => {
  it("follows 0, 5s, 30s, 2m, 10m, 1h, 6h", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => delayForAttempt(n))).toEqual([0, 5, 30, 120, 600, 3600, 21600]);
  });
  it("jitters within ±20%", () => {
    expect(withJitter(100, () => 0)).toBe(80);
    expect(withJitter(100, () => 1)).toBe(120);
    expect(withJitter(100, () => 0.5)).toBe(100);
    expect(withJitter(0, () => 1)).toBe(0);
  });
  it("schedules the next attempt relative to now", () => {
    const now = 1_000_000;
    expect(nextAttemptAt(1, now, () => 0.5).getTime()).toBe(now + 5_000);
    expect(nextAttemptAt(3, now, () => 0.5).getTime()).toBe(now + 120_000);
  });
  it("dead-letters after seven attempts", () => {
    expect(shouldDeadLetter(6)).toBe(false);
    expect(shouldDeadLetter(7)).toBe(true);
  });
  it("retries 5xx, timeouts and 429 but not other 4xx", () => {
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(null)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});
