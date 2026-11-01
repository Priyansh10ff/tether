import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { assertResolvesPublic, checkEndpointUrl, isPrivateIp } from "@/lib/urlsafety";

describe("endpoint URL safety", () => {
  beforeEach(() => { process.env.ALLOW_PRIVATE_ENDPOINTS = "0"; resetEnvCache(); });
  afterEach(() => { delete process.env.ALLOW_PRIVATE_ENDPOINTS; resetEnvCache(); });

  it("classifies private ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("rejects bad schemes, credentials and local hosts", () => {
    expect(checkEndpointUrl("ftp://x.com/a").ok).toBe(false);
    expect(checkEndpointUrl("https://user:pw@x.com/a").ok).toBe(false);
    expect(checkEndpointUrl("http://localhost:3000/hooks").ok).toBe(false);
    expect(checkEndpointUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(checkEndpointUrl("http://[::1]/").ok).toBe(false);
    expect(checkEndpointUrl("https://api.acme.com/hooks").ok).toBe(true);
  });

  it("allows private hosts when explicitly enabled (local development)", () => {
    process.env.ALLOW_PRIVATE_ENDPOINTS = "1"; resetEnvCache();
    expect(checkEndpointUrl("http://localhost:4000/hooks").ok).toBe(true);
  });

  it("catches DNS rebinding at send time", async () => {
    const evil = async () => [{ address: "10.0.0.5", family: 4 }];
    await expect(assertResolvesPublic(new URL("https://rebind.example/"), evil as never)).rejects.toThrow(/private/);
    const fine = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(assertResolvesPublic(new URL("https://example.com/"), fine as never)).resolves.toBeUndefined();
  });
});
