import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tether signs every delivery with HMAC-SHA256 over `${timestamp}.${body}`.
 * Headers sent to the receiver:
 *   Tether-Id          delivery id
 *   Tether-Timestamp   unix seconds
 *   Tether-Signature   v1=<hex>[,v1=<hex>]   (two entries during secret rotation)
 *   Tether-Attempt     1-based attempt number
 */

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function newEndpointSecret() {
  return "whsec_" + randomBytes(24).toString("base64url");
}

export function sign(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secrets: string[], timestamp: number, body: string) {
  return secrets.map((s) => `v1=${sign(s, timestamp, body)}`).join(",");
}

export function buildHeaders(opts: {
  deliveryId: string;
  attempt: number;
  body: string;
  secrets: string[];
  now?: number;
}) {
  const timestamp = Math.floor((opts.now ?? Date.now()) / 1000);
  return {
    "content-type": "application/json",
    "user-agent": "tether/0.1",
    "tether-id": opts.deliveryId,
    "tether-timestamp": String(timestamp),
    "tether-signature": signatureHeader(opts.secrets, timestamp, opts.body),
    "tether-attempt": String(opts.attempt),
  };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "expired" | "mismatch" };

export function verifySignature(opts: {
  secret: string;
  body: string;
  timestamp: string | number | null | undefined;
  signature: string | null | undefined;
  now?: number;
  tolerance?: number;
}): VerifyResult {
  if (!opts.timestamp || !opts.signature) return { ok: false, reason: "missing" };
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "missing" };
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > (opts.tolerance ?? SIGNATURE_TOLERANCE_SECONDS)) return { ok: false, reason: "expired" };

  const expected = Buffer.from(sign(opts.secret, ts, opts.body), "hex");
  for (const part of opts.signature.split(",")) {
    const [version, hex] = part.trim().split("=");
    if (version !== "v1" || !hex) continue;
    const given = Buffer.from(hex, "hex");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "mismatch" };
}
