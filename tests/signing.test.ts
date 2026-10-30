import { describe, expect, it } from "vitest";
import { buildHeaders, verifySignature } from "@/lib/signing";

describe("signing", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "order.paid" });

  it("round-trips a valid signature", () => {
    const now = 1_761_734_400_000;
    const h = buildHeaders({ deliveryId: "dlv_1", attempt: 1, body, secrets: [secret], now });
    const r = verifySignature({ secret, body, timestamp: h["tether-timestamp"], signature: h["tether-signature"], now });
    expect(r).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const now = Date.now();
    const h = buildHeaders({ deliveryId: "dlv_1", attempt: 1, body, secrets: [secret], now });
    const r = verifySignature({ secret, body: body + " ", timestamp: h["tether-timestamp"], signature: h["tether-signature"], now });
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an old timestamp (replay)", () => {
    const then = Date.now() - 10 * 60 * 1000;
    const h = buildHeaders({ deliveryId: "dlv_1", attempt: 1, body, secrets: [secret], now: then });
    const r = verifySignature({ secret, body, timestamp: h["tether-timestamp"], signature: h["tether-signature"] });
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts the previous secret during rotation", () => {
    const now = Date.now();
    const h = buildHeaders({ deliveryId: "dlv_1", attempt: 1, body, secrets: ["whsec_new", "whsec_old"], now });
    expect(h["tether-signature"].split(",")).toHaveLength(2);
    expect(verifySignature({ secret: "whsec_old", body, timestamp: h["tether-timestamp"], signature: h["tether-signature"], now }).ok).toBe(true);
    expect(verifySignature({ secret: "whsec_new", body, timestamp: h["tether-timestamp"], signature: h["tether-signature"], now }).ok).toBe(true);
  });
});
