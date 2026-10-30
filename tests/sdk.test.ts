import { describe, expect, it } from "vitest";
import { Tether, TetherVerificationError, verify, verifyNode } from "../packages/node/src/index";
import { buildHeaders } from "@/lib/signing";

const secret = "whsec_abc";
const body = JSON.stringify({ id: "evt_1", type: "order.paid", created_at: "2026-10-29T00:00:00Z", data: { n: 1 } });

describe("@tether/node verify", () => {
  it("accepts a request signed by the engine", async () => {
    const h = buildHeaders({ deliveryId: "dlv_1", attempt: 3, body, secrets: [secret] });
    const req = new Request("https://receiver.test/hooks", { method: "POST", headers: h, body });
    const ev = await verify<{ n: number }>(req, secret);
    expect(ev.type).toBe("order.paid");
    expect(ev.data.n).toBe(1);
    expect(ev.delivery_id).toBe("dlv_1");
    expect(ev.attempt).toBe(3);
  });

  it("rejects the wrong secret, a stale timestamp and missing headers", async () => {
    const h = buildHeaders({ deliveryId: "dlv_1", attempt: 1, body, secrets: [secret] });
    expect(() => verifyNode(body, h, "whsec_wrong")).toThrow(TetherVerificationError);
    const old = buildHeaders({ deliveryId: "dlv_1", attempt: 1, body, secrets: [secret], now: Date.now() - 600_000 });
    expect(() => verifyNode(body, old, secret)).toThrowError(/timestamp/);
    expect(() => verifyNode(body, {}, secret)).toThrowError(/missing/);
  });

  it("accepts either secret during rotation", () => {
    const h = buildHeaders({ deliveryId: "dlv_1", attempt: 1, body, secrets: ["whsec_new", "whsec_old"] });
    expect(verifyNode(body, h, ["whsec_new"]).id).toBe("evt_1");
    expect(verifyNode(body, h, ["whsec_old"]).id).toBe("evt_1");
  });
});

describe("@tether/node client", () => {
  it("posts events with the API key", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init! };
      return new Response(JSON.stringify({ id: "evt_9", deliveries: 2 }), { status: 202 });
    }) as typeof fetch;
    const t = new Tether({ apiKey: "tk_live_x", baseUrl: "https://t.example/", fetch: f });
    const r = await t.send("order.paid", { a: 1 }, { idempotencyKey: "k", orderingKey: "o" });
    expect(r).toEqual({ id: "evt_9", deliveries: 2 });
    expect(seen!.url).toBe("https://t.example/api/v1/events");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer tk_live_x");
    expect(JSON.parse(String(seen!.init.body))).toEqual({ type: "order.paid", data: { a: 1 }, idempotency_key: "k", ordering_key: "o" });
  });
});
