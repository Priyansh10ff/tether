import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "@/lib/env";
import { rateLimit, resetRateLimits } from "@/lib/ratelimit";

describe("env validation", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; resetEnvCache(); });

  it("applies defaults", () => {
    process.env.ADMIN_PASSWORD = "x"; process.env.SESSION_SECRET = "12345678";
    expect(env().WORKER_CONCURRENCY).toBe(8);
    expect(env().DELIVERY_TIMEOUT_MS).toBe(8000);
  });
  it("rejects nonsense numbers with a readable error", () => {
    process.env.ADMIN_PASSWORD = "x"; process.env.SESSION_SECRET = "12345678"; process.env.WORKER_CONCURRENCY = "lots";
    expect(() => env()).toThrow(/WORKER_CONCURRENCY/);
  });
});

describe("login rate limit", () => {
  afterEach(resetRateLimits);
  it("allows up to max then blocks until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit("ip", 5, 1000, t0).allowed).toBe(true);
    expect(rateLimit("ip", 5, 1000, t0 + 10).allowed).toBe(false);
    expect(rateLimit("ip", 5, 1000, t0 + 1001).allowed).toBe(true);
    expect(rateLimit("other", 5, 1000, t0 + 10).allowed).toBe(true);
  });
});
