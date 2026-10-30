import { NextResponse } from "next/server";

export const dynamic = "force-static";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Tether API",
    version: "0.1.0",
    description:
      "Send events to Tether and inspect their deliveries. Authenticate with `Authorization: Bearer <api key>`. Deliveries to your endpoints carry `Tether-Id`, `Tether-Timestamp`, `Tether-Signature` (HMAC-SHA256 over `timestamp.body`) and `Tether-Attempt` headers.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      Attempt: {
        type: "object",
        properties: {
          number: { type: "integer" }, status_code: { type: ["integer", "null"] }, ok: { type: "boolean" },
          error: { type: ["string", "null"] }, duration_ms: { type: "integer" }, started_at: { type: "string", format: "date-time" },
        },
      },
      Delivery: {
        type: "object",
        properties: {
          id: { type: "string", example: "dlv_01JB7Q4M8X…" },
          event_id: { type: "string" }, type: { type: "string" },
          endpoint: { type: "object", properties: { id: { type: "string" }, url: { type: "string" } } },
          status: { type: "string", enum: ["pending", "in_flight", "succeeded", "dead", "discarded"] },
          attempt: { type: "integer" }, max_attempts: { type: "integer" },
          last_status_code: { type: ["integer", "null"] }, last_error: { type: ["string", "null"] },
          next_attempt_at: { type: ["string", "null"], format: "date-time" }, dead_at: { type: ["string", "null"], format: "date-time" },
          created_at: { type: "string", format: "date-time" },
          attempts: { type: "array", items: { $ref: "#/components/schemas/Attempt" } },
        },
      },
      Event: {
        type: "object",
        properties: {
          id: { type: "string", example: "evt_01JB7Q4M8X…" }, type: { type: "string", example: "order.paid" },
          created_at: { type: "string", format: "date-time" }, idempotency_key: { type: ["string", "null"] }, ordering_key: { type: ["string", "null"] },
          data: {}, deliveries: { type: "array", items: { $ref: "#/components/schemas/Delivery" } },
        },
      },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    "/v1/events": {
      post: {
        summary: "Send an event",
        description: "Stores the event once and queues one delivery per subscribed endpoint. Repeating an idempotency key within 24 hours returns the original event with `duplicate: true`.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object", required: ["type", "data"],
                properties: {
                  type: { type: "string", pattern: "^[a-z0-9_]+(\\.[a-z0-9_]+)+$", example: "order.paid" },
                  data: {},
                  idempotency_key: { type: "string", description: "Also accepted as the Idempotency-Key header." },
                  ordering_key: { type: "string", description: "Deliveries sharing a key reach each endpoint in order." },
                },
              },
            },
          },
        },
        responses: {
          "202": { description: "Queued", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, deliveries: { type: "integer" } } } } } },
          "200": { description: "Duplicate idempotency key", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, duplicate: { type: "boolean" } } } } } },
          "400": { description: "Bad body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Bad API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "422": { description: "Invalid event type", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/v1/events/{id}": {
      get: {
        summary: "Get an event with its deliveries and attempts",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } }, "404": { description: "Not found" } },
      },
    },
    "/v1/deliveries": {
      get: {
        summary: "List deliveries",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["pending", "in_flight", "succeeded", "dead", "discarded"] } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "before", in: "query", schema: { type: "string", format: "date-time" }, description: "Cursor: `next_before` from the previous page." },
        ],
        responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Delivery" } }, next_before: { type: ["string", "null"] } } } } } } },
      },
    },
    "/v1/deliveries/{id}/replay": {
      post: {
        summary: "Replay a delivery",
        description: "Puts a dead, discarded or waiting delivery back on the queue immediately. The receiver gets a fresh signed request with `Tether-Attempt` continuing the count.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Queued" }, "404": { description: "Not found or not replayable" } },
      },
    },
    "/v1/attempts": {
      get: {
        summary: "List recent attempts",
        parameters: [
          { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } },
        ],
        responses: { "200": { description: "Newest first" } },
      },
    },
    "/health": { get: { summary: "Liveness and database check", security: [], responses: { "200": { description: "OK" }, "503": { description: "Database unreachable" } } } },
    "/metrics": { get: { summary: "Prometheus metrics", security: [], responses: { "200": { description: "text/plain exposition" } } } },
  },
} as const;

export function GET() {
  return NextResponse.json(spec);
}
