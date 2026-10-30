import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type TetherEvent<T = unknown> = {
  id: string;
  type: string;
  created_at: string;
  data: T;
  /** delivery id (Tether-Id header), stable across retries: dedupe on this */
  delivery_id: string;
  attempt: number;
};

export class TetherVerificationError extends Error {
  constructor(public reason: "missing_headers" | "timestamp_out_of_range" | "signature_mismatch" | "invalid_body") {
    super(`tether: ${reason.replace(/_/g, " ")}`);
    this.name = "TetherVerificationError";
  }
}

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

function header(h: HeaderSource, name: string): string | undefined {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const v = (h as Record<string, string | string[] | undefined>)[name] ?? (h as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function compute(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
}

/**
 * Verify a raw body + headers. Throws TetherVerificationError on failure.
 * Pass every secret you currently accept (the new one and, during rotation, the old one).
 */
export function verifyRaw<T = unknown>(
  body: string,
  headers: HeaderSource,
  secret: string | string[],
  opts: { tolerance?: number; now?: number } = {},
): TetherEvent<T> {
  const ts = header(headers, "tether-timestamp");
  const sig = header(headers, "tether-signature");
  const id = header(headers, "tether-id");
  if (!ts || !sig || !id) throw new TetherVerificationError("missing_headers");

  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!/^\d+$/.test(ts) || Math.abs(nowSec - Number(ts)) > (opts.tolerance ?? SIGNATURE_TOLERANCE_SECONDS)) {
    throw new TetherVerificationError("timestamp_out_of_range");
  }

  const secrets = Array.isArray(secret) ? secret : [secret];
  const given = sig
    .split(",")
    .map((p) => p.trim().split("="))
    .filter(([v, hex]) => v === "v1" && hex)
    .map(([, hex]) => Buffer.from(hex, "hex"));
  const ok = secrets.some((s) => {
    const expected = compute(s, ts, body);
    return given.some((g) => g.length === expected.length && timingSafeEqual(g, expected));
  });
  if (!ok) throw new TetherVerificationError("signature_mismatch");

  let parsed: { id: string; type: string; created_at: string; data: T };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new TetherVerificationError("invalid_body");
  }
  return { ...parsed, delivery_id: id, attempt: Number(header(headers, "tether-attempt") ?? 1) };
}

/** Verify a Fetch API Request (Next.js route handlers, Remix, Bun, Deno, Cloudflare Workers). */
export async function verify<T = unknown>(req: Request, secret: string | string[], opts?: { tolerance?: number }): Promise<TetherEvent<T>> {
  const body = await req.text();
  return verifyRaw<T>(body, req.headers, secret, opts);
}

/** Express/Node http: pass the raw string body (use express.raw or bodyParser with verify to capture it). */
export function verifyNode<T = unknown>(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>, secret: string | string[], opts?: { tolerance?: number }) {
  return verifyRaw<T>(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"), headers, secret, opts);
}

// ---------------------------------------------------------------------------
// Sending side

export type SendOptions = {
  /** Same key twice within 24h = one event. */
  idempotencyKey?: string;
  /** Deliveries sharing a key reach each endpoint in order. */
  orderingKey?: string;
};

export type SendResult = { id: string; deliveries?: number; duplicate?: boolean };

export class Tether {
  private base: string;
  constructor(private opts: { apiKey: string; baseUrl?: string; fetch?: typeof fetch }) {
    this.base = (opts.baseUrl ?? process.env.TETHER_URL ?? "http://localhost:3000").replace(/\/$/, "");
  }

  private async call<R>(method: string, path: string, body?: unknown): Promise<R> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(this.base + path, {
      method,
      headers: { authorization: `Bearer ${this.opts.apiKey}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as R & { error?: string };
    if (!res.ok) throw new Error(`tether: ${res.status} ${json.error ?? res.statusText}`);
    return json;
  }

  /** Send one event. Resolves once Tether has stored it and queued its deliveries. */
  send<T = unknown>(type: string, data: T, opts: SendOptions = {}) {
    return this.call<SendResult>("POST", "/api/v1/events", {
      type,
      data,
      idempotency_key: opts.idempotencyKey,
      ordering_key: opts.orderingKey,
    });
  }

  /** Fetch an event with its deliveries and attempts. */
  getEvent(id: string) {
    return this.call<Record<string, unknown>>("GET", `/api/v1/events/${encodeURIComponent(id)}`);
  }

  /** Put a dead, discarded or waiting delivery back on the queue now. */
  replay(deliveryId: string) {
    return this.call<{ id: string; status: string }>("POST", `/api/v1/deliveries/${encodeURIComponent(deliveryId)}/replay`);
  }
}
