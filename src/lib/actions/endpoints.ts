"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { endpoints, subscriptions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { currentProject } from "@/lib/project";
import { newEndpointSecret } from "@/lib/signing";

function parseTypes(raw: string) {
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

export async function createEndpoint(formData: FormData) {
  const { project } = await currentProject();
  const url = String(formData.get("url") ?? "").trim();
  let valid = false;
  try {
    valid = /^https?:$/.test(new URL(url).protocol);
  } catch {}
  if (!valid) redirect("/endpoints?error=url");
  const types = parseTypes(String(formData.get("types") ?? "*"));
  const id = newId.endpoint();
  const rl = Number(formData.get("rate_limit"));
  await db.transaction(async (tx) => {
    await tx.insert(endpoints).values({
      id,
      projectId: project.id,
      url,
      description: String(formData.get("description") ?? "").trim() || null,
      secret: newEndpointSecret(),
      rateLimitPerSecond: Number.isFinite(rl) && rl > 0 ? rl : null,
    });
    await tx.insert(subscriptions).values((types.length ? types : ["*"]).map((eventType) => ({ id: newId.subscription(), endpointId: id, eventType })));
  });
  redirect(`/endpoints/${id}?created=1`);
}

async function owned(id: string) {
  const { project } = await currentProject();
  const ep = await db.query.endpoints.findFirst({ where: and(eq(endpoints.id, id), eq(endpoints.projectId, project.id)) });
  if (!ep) redirect("/endpoints");
  return ep;
}

export async function setEndpointState(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  const state = String(formData.get("state")) === "paused" ? "paused" : "active";
  await db
    .update(endpoints)
    .set({ state, consecutiveFailures: 0, breakerOpenedAt: null, breakerProbeAt: null })
    .where(eq(endpoints.id, ep.id));
  revalidatePath(`/endpoints/${ep.id}`);
  revalidatePath("/endpoints");
}

export async function rotateSecret(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  await db
    .update(endpoints)
    .set({ secret: newEndpointSecret(), previousSecret: ep.secret, previousSecretExpiresAt: new Date(Date.now() + 24 * 3600 * 1000) })
    .where(eq(endpoints.id, ep.id));
  revalidatePath(`/endpoints/${ep.id}`);
}

export async function updateSubscriptions(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  const types = parseTypes(String(formData.get("types") ?? ""));
  await db.transaction(async (tx) => {
    await tx.delete(subscriptions).where(eq(subscriptions.endpointId, ep.id));
    if (types.length) await tx.insert(subscriptions).values(types.map((eventType) => ({ id: newId.subscription(), endpointId: ep.id, eventType })));
  });
  revalidatePath(`/endpoints/${ep.id}`);
}

export async function updateEndpoint(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  const rl = Number(formData.get("rate_limit"));
  await db
    .update(endpoints)
    .set({
      description: String(formData.get("description") ?? "").trim() || null,
      rateLimitPerSecond: Number.isFinite(rl) && rl > 0 ? rl : null,
    })
    .where(eq(endpoints.id, ep.id));
  revalidatePath(`/endpoints/${ep.id}`);
}

export async function deleteEndpoint(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  await db.delete(endpoints).where(eq(endpoints.id, ep.id));
  redirect("/endpoints");
}
