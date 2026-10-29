import { randomBytes } from "node:crypto";

// Crockford base32 ULID-style ids: time-sortable, URL-safe, no dashes.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(ms: number, len = 10) {
  let out = "";
  for (let i = len - 1; i >= 0; i--) {
    out = ALPHABET[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

function encodeRandom(len = 16) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

export function ulid(now = Date.now()) {
  return encodeTime(now) + encodeRandom();
}

export const newId = {
  project: () => "proj_" + ulid(),
  apiKey: () => "key_" + ulid(),
  endpoint: () => "ep_" + ulid(),
  subscription: () => "sub_" + ulid(),
  event: () => "evt_" + ulid(),
  delivery: () => "dlv_" + ulid(),
  attempt: () => "att_" + ulid(),
};
