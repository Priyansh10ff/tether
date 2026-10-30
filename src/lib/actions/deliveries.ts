"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { currentProject } from "@/lib/project";

/** Put a delivery back on the queue now. Works for pending (skip the wait), dead and discarded. */
export async function replayDelivery(formData: FormData) {
  const { project } = await currentProject();
  const id = String(formData.get("id"));
  await db
    .update(deliveries)
    .set({ status: "pending", nextAttemptAt: new Date(), deadAt: null, claimedBy: null, claimedAt: null })
    .where(and(eq(deliveries.id, id), eq(deliveries.projectId, project.id), inArray(deliveries.status, ["pending", "dead", "discarded"])));
  revalidatePath("/", "layout");
}

export async function replayAllDead(formData: FormData) {
  const { project } = await currentProject();
  const endpointId = String(formData.get("endpoint") ?? "");
  await db
    .update(deliveries)
    .set({ status: "pending", nextAttemptAt: new Date(), deadAt: null })
    .where(and(eq(deliveries.projectId, project.id), eq(deliveries.status, "dead"), ...(endpointId ? [eq(deliveries.endpointId, endpointId)] : [])));
  revalidatePath("/", "layout");
}

export async function discardDelivery(formData: FormData) {
  const { project } = await currentProject();
  await db
    .update(deliveries)
    .set({ status: "discarded" })
    .where(and(eq(deliveries.id, String(formData.get("id"))), eq(deliveries.projectId, project.id), eq(deliveries.status, "dead")));
  revalidatePath("/", "layout");
}
