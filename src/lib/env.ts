import { z } from "zod";

/**
 * Validated process configuration. Imported by anything that needs a setting so a bad
 * deployment fails at boot with a readable message instead of at 3am with a stack trace.
 */
const isProd = process.env.NODE_ENV === "production";

const Schema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://tether:tether@localhost:5433/tether"),
  ADMIN_PASSWORD: z.string().min(isProd ? 12 : 1, "ADMIN_PASSWORD must be at least 12 characters in production"),
  SESSION_SECRET: z.string().min(isProd ? 32 : 8, "SESSION_SECRET must be at least 32 characters in production"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(256).default(8),
  WORKER_POLL_MS: z.coerce.number().int().min(50).max(60_000).default(500),
  DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(8000),
  BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(10),
  BREAKER_PROBE_MS: z.coerce.number().int().min(1000).default(60_000),
  RETENTION_BODY_DAYS: z.coerce.number().int().min(0).default(7),
  RETENTION_EVENT_DAYS: z.coerce.number().int().min(1).default(30),
  MAX_EVENT_BYTES: z.coerce.number().int().min(1024).default(256 * 1024),
  ALLOW_PRIVATE_ENDPOINTS: z.enum(["0", "1"]).default(isProd ? "0" : "1"),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),
  LOGIN_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60_000),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${lines}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached parse so a test can change process.env. */
export function resetEnvCache() {
  cached = null;
}
