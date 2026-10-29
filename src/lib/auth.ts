import { and, eq, isNull } from "drizzle-orm";
import { apiKeys } from "@/db/schema";
import { hashApiKey } from "./apikeys";
import type { Db } from "@/db";

export async function authenticateApiKey(db: Db, header: string | null) {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return null;
  const hash = hashApiKey(m[1]);
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)),
    columns: { id: true, projectId: true },
  });
  if (!row) return null;
  // Fire and forget: last_used_at is informational.
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {});
  return row;
}
