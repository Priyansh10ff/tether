"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { endpoints, subscriptions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { currentProject } from "@/lib/project";
import { newEndpointSecret } from "@/lib/signing";
import { checkEndpointUrl } from "@/lib/urlsafety";
import { audit } from "@/lib/audit";

function parseTypes(raw: string) {
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

export async function createEndpoint(formData: FormData) {
  const { project } = await currentProject();
  const url = String(formData.get("url") ?? "").trim();
  const check = checkEndpointUrl(url);
  if (!check.ok) redirect("/endpoints?error=" + encodeURIComponent(check.reason));
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
  await audit(db, { projectId: project.id, actor: "admin", action: "endpoint.create", target: id, detail: { url, types } });
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
  await audit(db, { projectId: ep.projectId, actor: "admin", action: state === "paused" ? "endpoint.pause" : "endpoint.resume", target: ep.id });
  revalidatePath(`/endpoints/${ep.id}`);
  revalidatePath("/endpoints");
}

export async function rotateSecret(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  await db
    .update(endpoints)
    .set({ secret: newEndpointSecret(), previousSecret: ep.secret, previousSecretExpiresAt: new Date(Date.now() + 24 * 3600 * 1000) })
    .where(eq(endpoints.id, ep.id));
  await audit(db, { projectId: ep.projectId, actor: "admin", action: "endpoint.rotate_secret", target: ep.id });
  revalidatePath(`/endpoints/${ep.id}`);
}

export async function updateSubscriptions(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  const types = parseTypes(String(formData.get("types") ?? ""));
  await db.transaction(async (tx) => {
    await tx.delete(subscriptions).where(eq(subscriptions.endpointId, ep.id));
    if (types.length) await tx.insert(subscriptions).values(types.map((eventType) => ({ id: newId.subscription(), endpointId: ep.id, eventType })));
  });
  await audit(db, { projectId: ep.projectId, actor: "admin", action: "endpoint.subscriptions", target: ep.id, detail: { types } });
  revalidatePath(`/endpoints/${ep.id}`);
}

export async function updateEndpoint(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  const rl = Number(formData.get("rate_limit"));
  const ma = Number(formData.get("max_attempts"));
  const patch = {
    description: String(formData.get("description") ?? "").trim() || null,
    rateLimitPerSecond: Number.isFinite(rl) && rl > 0 ? Math.min(rl, 10_000) : null,
    maxAttempts: Number.isFinite(ma) && ma >= 1 && ma <= 20 ? ma : null,
  };
  await db.update(endpoints).set(patch).where(eq(endpoints.id, ep.id));
  await audit(db, { projectId: ep.projectId, actor: "admin", action: "endpoint.update", target: ep.id, detail: patch });
  revalidatePath(`/endpoints/${ep.id}`);
}

export async function deleteEndpoint(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  await db.delete(endpoints).where(eq(endpoints.id, ep.id));
  await audit(db, { projectId: ep.projectId, actor: "admin", action: "endpoint.delete", target: ep.id, detail: { url: ep.url } });
  redirect("/endpoints");
}

/** Queue one `tether.ping` delivery to this endpoint only, bypassing subscriptions. */
export async function pingEndpoint(formData: FormData) {
  const ep = await owned(String(formData.get("id")));
  const { events, deliveries } = await import("@/db/schema");
  const { DEFAULT_MAX_ATTEMPTS } = await import("@/lib/retry");
  const eventId = newId.event();
  await db.transaction(async (tx) => {
    await tx.insert(events).values({ id: eventId, projectId: ep.projectId, type: "tether.ping", payload: { endpoint_id: ep.id, sent_at: new Date().toISOString() } });
    await tx.insert(deliveries).values({ id: newId.delivery(), projectId: ep.projectId, eventId, endpointId: ep.id, maxAttempts: ep.maxAttempts ?? DEFAULT_MAX_ATTEMPTS });
  });
  await audit(db, { projectId: ep.projectId, actor: "admin", action: "event.send", target: eventId, detail: { type: "tether.ping", endpoint: ep.id } });
  redirect(`/events/${eventId}`);
}
