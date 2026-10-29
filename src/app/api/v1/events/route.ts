import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ingestEvent } from "@/engine";
import { authenticateApiKey } from "@/lib/auth";

export const runtime = "nodejs";

const Body = z.object({
  type: z.string().min(3).max(100),
  data: z.unknown(),
  idempotency_key: z.string().min(1).max(200).optional(),
  ordering_key: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticateApiKey(db, req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "invalid or missing API key" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });

  const idem = parsed.data.idempotency_key ?? req.headers.get("idempotency-key") ?? undefined;
  const result = await ingestEvent(db, {
    projectId: auth.projectId,
    type: parsed.data.type,
    payload: parsed.data.data ?? {},
    idempotencyKey: idem,
    orderingKey: parsed.data.ordering_key,
  });

  if (result.status === "invalid") return NextResponse.json({ error: result.error }, { status: 422 });
  if (result.status === "duplicate") return NextResponse.json({ id: result.eventId, duplicate: true }, { status: 200 });
  return NextResponse.json({ id: result.eventId, deliveries: result.deliveries }, { status: 202 });
}
