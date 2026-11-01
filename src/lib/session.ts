import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "./env";
import { rateLimit } from "./ratelimit";

const COOKIE = "tether_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(value: string) {
  return createHmac("sha256", env().SESSION_SECRET).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Best-effort client address for rate limiting. Trusts the first X-Forwarded-For hop only behind a proxy. */
export async function clientKey() {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : null) || h.get("x-real-ip") || "local";
}

export type LoginResult = "ok" | "bad_password" | "rate_limited";

export async function attemptLogin(password: string): Promise<LoginResult> {
  const { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, ADMIN_PASSWORD } = env();
  const rl = rateLimit(`login:${await clientKey()}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!rl.allowed) return "rate_limited";
  if (!safeEqual(password, ADMIN_PASSWORD)) return "bad_password";
  await createSession();
  return "ok";
}

export async function createSession() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `admin.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function isAuthenticated() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const i = raw.lastIndexOf(".");
  if (i < 0) return false;
  const payload = raw.slice(0, i), sig = raw.slice(i + 1);
  if (!safeEqual(sig, sign(payload))) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}
