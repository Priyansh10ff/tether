import { auditLog } from "@/db/schema";
import { newId } from "./ids";
import type { Db } from "@/db";

export type AuditAction =
  | "endpoint.create" | "endpoint.update" | "endpoint.delete" | "endpoint.pause" | "endpoint.resume" | "endpoint.rotate_secret" | "endpoint.subscriptions"
  | "key.create" | "key.revoke"
  | "delivery.replay" | "delivery.replay_all" | "delivery.discard"
  | "project.create" | "project.rename" | "event.send";

/** Append one audit row. Never throws: an audit failure must not break the action it records. */
export async function audit(db: Db, entry: { projectId: string | null; actor: string; action: AuditAction; target?: string | null; detail?: Record<string, unknown> }) {
  try {
    await db.insert(auditLog).values({
      id: newId.audit(),
      projectId: entry.projectId,
      actor: entry.actor,
      action: entry.action,
      target: entry.target ?? null,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    console.error("audit write failed", err);
  }
}
