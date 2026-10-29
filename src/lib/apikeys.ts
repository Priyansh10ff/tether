import { createHash, randomBytes } from "node:crypto";

export function newApiKey() {
  const key = "tk_live_" + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
