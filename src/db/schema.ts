import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const deliveryStatus = pgEnum("delivery_status", [
  "pending", // scheduled, waiting for next_attempt_at
  "in_flight", // claimed by a worker
  "succeeded",
  "dead", // retries exhausted, parked in the dead-letter queue
  "discarded", // removed from DLQ by a human
]);

export const endpointState = pgEnum("endpoint_state", ["active", "paused", "open"]); // open = circuit breaker tripped

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(), // first 12 chars, shown in the UI
    hash: text("hash").notNull(), // sha256 of the full key
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.hash)],
);

export const endpoints = pgTable(
  "endpoints",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description"),
    secret: text("secret").notNull(), // whsec_… used for HMAC
    previousSecret: text("previous_secret"), // valid for 24h after rotation
    previousSecretExpiresAt: ts("previous_secret_expires_at"),
    state: endpointState("state").notNull().default("active"),
    rateLimitPerSecond: integer("rate_limit_per_second"),
    maxAttempts: integer("max_attempts"), // null = project default (7)
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    breakerOpenedAt: ts("breaker_opened_at"),
    breakerProbeAt: ts("breaker_probe_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("endpoints_project_idx").on(t.projectId)],
);

// Which event types an endpoint wants. "order.*" and "*" are allowed.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id").notNull().references(() => endpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
  },
  (t) => [uniqueIndex("subscriptions_endpoint_type_idx").on(t.endpointId, t.eventType)],
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: text("idempotency_key"),
    orderingKey: text("ordering_key"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("events_idempotency_idx").on(t.projectId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index("events_project_created_idx").on(t.projectId, t.createdAt),
  ],
);

// One row per (event, endpoint). This is the unit of work.
export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    endpointId: text("endpoint_id").notNull().references(() => endpoints.id, { onDelete: "cascade" }),
    status: deliveryStatus("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0), // attempts made so far
    maxAttempts: integer("max_attempts").notNull().default(7),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    orderingKey: text("ordering_key"),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    claimedBy: text("claimed_by"),
    claimedAt: ts("claimed_at"),
    deliveredAt: ts("delivered_at"),
    deadAt: ts("dead_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("deliveries_event_idx").on(t.eventId),
    index("deliveries_endpoint_idx").on(t.endpointId, t.createdAt),
    index("deliveries_ordering_idx").on(t.endpointId, t.orderingKey, t.createdAt),
  ],
);

// Every try, success or not. The dashboard is a view over this table.
export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    statusCode: integer("status_code"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    responseBody: text("response_body"), // truncated to 4 KB
    durationMs: integer("duration_ms").notNull(),
    workerId: text("worker_id").notNull(),
    startedAt: ts("started_at").notNull(),
  },
  (t) => [index("attempts_delivery_idx").on(t.deliveryId, t.number)],
);

export type Project = typeof projects.$inferSelect;
export type Endpoint = typeof endpoints.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;

// Who did what in the dashboard or API. Append-only.
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(), // "admin" | "api:<key prefix>" | "system"
    action: text("action").notNull(), // e.g. endpoint.create, delivery.replay
    target: text("target"), // id of the thing acted on
    detail: jsonb("detail"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_project_created_idx").on(t.projectId, t.createdAt)],
);

// Live workers. A row is touched every few seconds; stale rows mean a dead worker.
export const workers = pgTable("workers", {
  id: text("id").primaryKey(),
  hostname: text("hostname").notNull(),
  concurrency: integer("concurrency").notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  heartbeatAt: ts("heartbeat_at").notNull().defaultNow(),
  delivered: integer("delivered").notNull().default(0),
  failed: integer("failed").notNull().default(0),
});

export type AuditEntry = typeof auditLog.$inferSelect;
export type Worker = typeof workers.$inferSelect;
