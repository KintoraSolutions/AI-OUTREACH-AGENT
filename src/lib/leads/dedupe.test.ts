import { describe, expect, it } from "vitest";
import { computeDedupeKey, normalizeDomain, normalizeName } from "@/lib/leads/dedupe";

describe("normalizeDomain", () => {
  it("strips protocol, www, and path", () => {
    expect(normalizeDomain("https://www.Example.com/contact")).toBe("example.com");
    expect(normalizeDomain("example.com")).toBe("example.com");
    expect(normalizeDomain("http://sub.example.com")).toBe("sub.example.com");
  });

  it("returns empty for missing or invalid input", () => {
    expect(normalizeDomain(null)).toBe("");
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain("not a url with spaces")).toBe("");
  });
});

describe("normalizeName", () => {
  it("lowercases and removes common clinic filler words", () => {
    expect(normalizeName("The Riverside Physiotherapy Clinic")).toBe("riverside physiotherapy");
    expect(normalizeName("Downtown Dental Group Inc.")).toBe("downtown dental");
  });

  it("normalizes ampersands and punctuation", () => {
    expect(normalizeName("Smith & Jones Optometry")).toBe("smith jones optometry");
  });
});

describe("computeDedupeKey", () => {
  it("prefers the domain when a website exists", () => {
    const a = computeDedupeKey({ name: "Riverside Physio", websiteUrl: "https://www.riverside.com" });
    const b = computeDedupeKey({ name: "Different Name", websiteUrl: "http://riverside.com/x" });
    expect(a).toBe("d:riverside.com");
    expect(a).toBe(b);
  });

  it("falls back to name + address when there is no website", () => {
    const key = computeDedupeKey({ name: "Harbor Optometry", primaryAddress: "5 Demo Road" });
    expect(key.startsWith("na:")).toBe(true);
    expect(key).toContain("harbor optometry");
  });

  it("treats www and trailing path variants as the same clinic", () => {
    const a = computeDedupeKey({ name: "X", websiteUrl: "https://www.clinic.example/" });
    const b = computeDedupeKey({ name: "X", websiteUrl: "https://clinic.example/book" });
    expect(a).toBe(b);
  });
});
