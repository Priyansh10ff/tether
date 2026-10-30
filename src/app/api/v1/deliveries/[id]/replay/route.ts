import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /v1/deliveries/:id/replay — put a dead, discarded or waiting delivery back on the queue now. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(db, req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "invalid or missing API key" }, { status: 401 });
  const { id } = await ctx.params;
  const rows = await db
    .update(deliveries)
    .set({ status: "pending", nextAttemptAt: new Date(), deadAt: null, claimedBy: null, claimedAt: null })
    .where(and(eq(deliveries.id, id), eq(deliveries.projectId, auth.projectId), inArray(deliveries.status, ["pending", "dead", "discarded"])))
    .returning({ id: deliveries.id, attempt: deliveries.attempt });
  if (!rows.length) return NextResponse.json({ error: "not found or not replayable" }, { status: 404 });
  return NextResponse.json({ id: rows[0].id, status: "pending", attempts_so_far: rows[0].attempt });
}
