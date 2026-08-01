import { describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import {
  assertSafeUrlResolved,
  isBlockedIp,
  isSafeUrl,
  toAbsoluteUrl,
} from "@/lib/research/url-guard";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

describe("SSRF url guard", () => {
  it("allows public https/http URLs", () => {
    expect(isSafeUrl("https://clinic.example/contact")).toBe(true);
    expect(isSafeUrl("http://clinic.example")).toBe(true);
  });

  it("blocks localhost and loopback", () => {
    expect(isSafeUrl("http://localhost/admin")).toBe(false);
    expect(isSafeUrl("http://127.0.0.1")).toBe(false);
    expect(isSafeUrl("http://[::1]/")).toBe(false);
  });

  it("blocks private and link-local IPv4 ranges", () => {
    expect(isSafeUrl("http://10.0.0.5")).toBe(false);
    expect(isSafeUrl("http://192.168.1.1")).toBe(false);
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeUrl("http://172.16.0.1")).toBe(false);
  });

  it("blocks non-web schemes and bare hostnames", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("ftp://clinic.example")).toBe(false);
    expect(isSafeUrl("http://intranet")).toBe(false);
  });
});

describe("isBlockedIp (resolved-address classification)", () => {
  it("blocks private/reserved/loopback/link-local IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("blocks loopback/ULA/link-local/mapped IPv6", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe("assertSafeUrlResolved (DNS-aware SSRF guard)", () => {
  const mockedLookup = vi.mocked(lookup);

  it("rejects a public hostname that resolves to an internal address (metadata/rebinding)", async () => {
    // e.g. metadata.google.internal or *.nip.io resolving to link-local space.
    mockedLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);
    await expect(assertSafeUrlResolved("http://metadata.google.internal/")).rejects.toThrow();
  });

  it("rejects when any resolved address is internal (mixed A records)", async () => {
    mockedLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ] as never);
    await expect(assertSafeUrlResolved("http://evil.example/")).rejects.toThrow();
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertSafeUrlResolved("https://clinic.example/contact")).resolves.toBeInstanceOf(URL);
  });

  it("still rejects non-web schemes before resolving", async () => {
    await expect(assertSafeUrlResolved("file:///etc/passwd")).rejects.toThrow();
  });
});

describe("toAbsoluteUrl", () => {
  it("adds https:// to schemeless input", () => {
    expect(toAbsoluteUrl("clinic.example")).toBe("https://clinic.example/");
  });
  it("returns null for empty input", () => {
    expect(toAbsoluteUrl("")).toBeNull();
    expect(toAbsoluteUrl(null)).toBeNull();
  });
});
