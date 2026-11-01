import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ingestEvent } from "@/engine";
import { authenticateApiKey } from "@/lib/auth";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";
import { log, requestId } from "@/lib/log";

export const runtime = "nodejs";

const Body = z.object({
  type: z.string().min(3).max(100),
  data: z.unknown(),
  idempotency_key: z.string().min(1).max(200).optional(),
  ordering_key: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const rid = requestId(req);
  const t0 = Date.now();
  const reply = (body: unknown, status: number, extra: Record<string, string> = {}) => {
    log(status >= 500 ? "error" : "info", "ingest", { rid, status, ms: Date.now() - t0 });
    return NextResponse.json(body, { status, headers: { "x-request-id": rid, ...extra } });
  };
  const auth = await authenticateApiKey(db, req.headers.get("authorization"));
  if (!auth) return reply({ error: "invalid or missing API key" }, 401);
  const rl = rateLimit(`ingest:${auth.id}`, env().INGEST_RATE_PER_KEY, 1000);
  if (!rl.allowed) return reply({ error: "rate limit exceeded for this API key" }, 429, { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });

  const limit = env().MAX_EVENT_BYTES;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limit) return reply({ error: `body exceeds ${limit} bytes` }, 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > limit) return reply({ error: `body exceeds ${limit} bytes` }, 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply({ error: "body must be JSON" }, 400);
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return reply({ error: "invalid body", issues: parsed.error.issues }, 400);

  const idem = parsed.data.idempotency_key ?? req.headers.get("idempotency-key") ?? undefined;
  const result = await ingestEvent(db, {
    projectId: auth.projectId,
    type: parsed.data.type,
    payload: parsed.data.data ?? {},
    idempotencyKey: idem,
    orderingKey: parsed.data.ordering_key,
  });

  if (result.status === "invalid") return reply({ error: result.error }, 422);
  if (result.status === "duplicate") return reply({ id: result.eventId, duplicate: true }, 200);
  return reply({ id: result.eventId, deliveries: result.deliveries }, 202);
}
