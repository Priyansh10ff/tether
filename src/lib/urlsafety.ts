import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { env } from "./env";

/**
 * Endpoint URLs are attacker-controlled input to an HTTP client that runs inside your network.
 * Without this, a tenant could point an endpoint at http://169.254.169.254/ or http://localhost:5432
 * and use Tether as a proxy. Blocked unless ALLOW_PRIVATE_ENDPOINTS=1 (the dev default).
 */

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    const inRange = (cidr: string) => {
      const [base, bits] = cidr.split("/");
      const mask = bits === "0" ? 0 : (~0 << (32 - Number(bits))) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    };
    return ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16", "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4"].some(inRange);
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local, ULA
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7)); // v4-mapped
    return false;
  }
  return true; // not an IP at all: be strict
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Static checks: scheme, no credentials, no obviously private host. Does not touch the network. */
export function checkEndpointUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "only http and https are allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials in the URL are not allowed; use a header or a signed secret" };
  if (env().ALLOW_PRIVATE_ENDPOINTS === "1") return { ok: true, url };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return { ok: false, reason: "local hostnames are not allowed" };
  if (isIP(host) && isPrivateIp(host)) return { ok: false, reason: "private or loopback addresses are not allowed" };
  return { ok: true, url };
}

/**
 * Resolve the host right before sending and refuse private results, so a public hostname that
 * later points at an internal address (DNS rebinding) is still caught.
 */
export async function assertResolvesPublic(url: URL, resolver = lookup) {
  if (env().ALLOW_PRIVATE_ENDPOINTS === "1") return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("endpoint resolves to a private address");
    return;
  }
  const addrs = await resolver(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("endpoint resolves to a private address");
}
