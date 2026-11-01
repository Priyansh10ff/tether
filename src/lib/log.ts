import { randomUUID } from "node:crypto";

/** One JSON line per event. Pipe to anything; grep by request id. */
export function log(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export function requestId(req: Request) {
  const given = req.headers.get("x-request-id");
  return given && /^[A-Za-z0-9_-]{8,64}$/.test(given) ? given : randomUUID();
}
