/**
 * Route handler tests: real Next route functions called with Request objects against an
 * in-memory PGlite database (DATABASE_URL=pglite://memory://), migrated with the real files.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/pglite/migrator";

process.env.DATABASE_URL = "pglite://memory://";
process.env.ADMIN_PASSWORD = "test-password-123";
process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";

let POST: typeof import("@/app/api/v1/events/route").POST;
let GETone: typeof import("@/app/api/v1/events/[id]/route").GET;
let key = "";

beforeAll(async () => {
  const { db } = await import("@/db");
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  const { seedProject } = await import("../helpers/db");
  const { apiKeys } = await import("@/db/schema");
  const { newApiKey } = await import("@/lib/apikeys");
  const { newId } = await import("@/lib/ids");
  const { projectId } = await seedProject(db, { types: ["order.*"] });
  const k = newApiKey();
  key = k.key;
  await db.insert(apiKeys).values({ id: newId.apiKey(), projectId, name: "t", prefix: k.prefix, hash: k.hash });
  ({ POST } = await import("@/app/api/v1/events/route"));
  ({ GET: GETone } = await import("@/app/api/v1/events/[id]/route"));
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://t/api/v1/events", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("POST /v1/events", () => {
  it("rejects missing or wrong API keys", async () => {
    expect((await POST(new Request("http://t/api/v1/events", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await post({ type: "order.paid", data: {} }, { authorization: "Bearer tk_live_nope" })).status).toBe(401);
  });

  it("queues an event and returns 202 with the delivery count", async () => {
    const res = await post({ type: "order.paid", data: { n: 1 } });
    expect(res.status).toBe(202);
    const j = await res.json();
    expect(j.id).toMatch(/^evt_/);
    expect(j.deliveries).toBe(1);
    const one = await GETone(new Request("http://t/x", { headers: { authorization: `Bearer ${key}` } }), { params: Promise.resolve({ id: j.id }) });
    expect(one.status).toBe(200);
    expect((await one.json()).deliveries[0].status).toBe("pending");
  });

  it("returns 200 duplicate for a repeated idempotency key (header or body)", async () => {
    const a = await post({ type: "order.paid", data: {} }, { "idempotency-key": "abc" });
    const b = await post({ type: "order.paid", data: {}, idempotency_key: "abc" });
    expect(a.status).toBe(202);
    expect(b.status).toBe(200);
    expect((await b.json()).duplicate).toBe(true);
  });

  it("validates the body", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ data: {} })).status).toBe(400);
    expect((await post({ type: "Bad Type", data: {} })).status).toBe(422);
  });

  it("refuses oversized bodies with 413", async () => {
    const big = { type: "order.paid", data: { blob: "x".repeat(300 * 1024) } };
    expect((await post(big)).status).toBe(413);
  });

  it("does not leak other projects' events", async () => {
    const res = await GETone(new Request("http://t/x", { headers: { authorization: `Bearer ${key}` } }), { params: Promise.resolve({ id: "evt_DOESNOTEXIST" }) });
    expect(res.status).toBe(404);
  });
});
