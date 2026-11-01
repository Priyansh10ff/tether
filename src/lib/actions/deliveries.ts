"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { currentProject } from "@/lib/project";
import { audit } from "@/lib/audit";

/** Put a delivery back on the queue now. Works for pending (skip the wait), dead and discarded. */
export async function replayDelivery(formData: FormData) {
  const { project } = await currentProject();
  const id = String(formData.get("id"));
  await db
    .update(deliveries)
    .set({ status: "pending", nextAttemptAt: new Date(), deadAt: null, claimedBy: null, claimedAt: null })
    .where(and(eq(deliveries.id, id), eq(deliveries.projectId, project.id), inArray(deliveries.status, ["pending", "dead", "discarded"])));
  await audit(db, { projectId: project.id, actor: "admin", action: "delivery.replay", target: id });
  revalidatePath("/", "layout");
}

export async function replayAllDead(formData: FormData) {
  const { project } = await currentProject();
  const endpointId = String(formData.get("endpoint") ?? "");
  const replayed = await db
    .update(deliveries)
    .set({ status: "pending", nextAttemptAt: new Date(), deadAt: null })
    .where(and(eq(deliveries.projectId, project.id), eq(deliveries.status, "dead"), ...(endpointId ? [eq(deliveries.endpointId, endpointId)] : [])))
    .returning({ id: deliveries.id });
  await audit(db, { projectId: project.id, actor: "admin", action: "delivery.replay_all", target: endpointId || null, detail: { count: replayed.length } });
  revalidatePath("/", "layout");
}

export async function discardDelivery(formData: FormData) {
  const { project } = await currentProject();
  await db
    .update(deliveries)
    .set({ status: "discarded" })
    .where(and(eq(deliveries.id, String(formData.get("id"))), eq(deliveries.projectId, project.id), eq(deliveries.status, "dead")));
  await audit(db, { projectId: project.id, actor: "admin", action: "delivery.discard", target: String(formData.get("id")) });
  revalidatePath("/", "layout");
}

/** Skip the backoff wait for everything currently retrying in this project. */
export async function retryAllWaiting() {
  const { project } = await currentProject();
  const rows = await db
    .update(deliveries)
    .set({ nextAttemptAt: new Date() })
    .where(and(eq(deliveries.projectId, project.id), eq(deliveries.status, "pending")))
    .returning({ id: deliveries.id });
  await audit(db, { projectId: project.id, actor: "admin", action: "delivery.replay_all", detail: { scope: "waiting", count: rows.length } });
  revalidatePath("/", "layout");
}
