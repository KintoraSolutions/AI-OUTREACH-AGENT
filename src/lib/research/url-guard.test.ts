import { describe, expect, it } from "vitest";
import { isSafeUrl, toAbsoluteUrl } from "@/lib/research/url-guard";

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

describe("toAbsoluteUrl", () => {
  it("adds https:// to schemeless input", () => {
    expect(toAbsoluteUrl("clinic.example")).toBe("https://clinic.example/");
  });
  it("returns null for empty input", () => {
    expect(toAbsoluteUrl("")).toBeNull();
    expect(toAbsoluteUrl(null)).toBeNull();
  });
});
