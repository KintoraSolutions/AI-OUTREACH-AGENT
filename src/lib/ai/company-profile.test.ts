import { describe, expect, it } from "vitest";
import { companyProfileSchema, DEFAULT_COMPANY_PROFILE } from "@/lib/ai/company-profile";

describe("companyProfileSchema", () => {
  it("trims text fields and coerces blank/whitespace to null", () => {
    const parsed = companyProfileSchema.parse({
      companyDescription: "  We help clinics.  ",
      offer: "   ",
      method: "",
      targetAudience: null,
      websiteUrl: "https://acme.example",
      linkedinUrl: undefined,
      socialLinks: "",
    });
    expect(parsed.companyDescription).toBe("We help clinics.");
    expect(parsed.offer).toBeNull();
    expect(parsed.method).toBeNull();
    expect(parsed.targetAudience).toBeNull();
    expect(parsed.websiteUrl).toBe("https://acme.example");
    expect(parsed.linkedinUrl).toBeNull();
    expect(parsed.socialLinks).toEqual([]);
  });

  it("splits social links per line, trimming and dropping blanks", () => {
    const parsed = companyProfileSchema.parse({
      socialLinks: "  instagram.com/acme \n\n x.com/acme \n   ",
    });
    expect(parsed.socialLinks).toEqual(["instagram.com/acme", "x.com/acme"]);
  });

  it("accepts a stored string[] for social links (round-trips a saved value)", () => {
    const parsed = companyProfileSchema.parse({
      socialLinks: ["instagram.com/acme", "  ", "x.com/acme"],
    });
    expect(parsed.socialLinks).toEqual(["instagram.com/acme", "x.com/acme"]);
  });

  it("caps overly long text and the number of social links", () => {
    const parsed = companyProfileSchema.parse({
      companyDescription: "a".repeat(1000),
      socialLinks: Array.from({ length: 40 }, (_, i) => `link-${i}`).join("\n"),
    });
    expect(parsed.companyDescription).toHaveLength(600);
    expect(parsed.socialLinks).toHaveLength(10);
  });

  it("parses an empty object into the empty defaults shape", () => {
    const parsed = companyProfileSchema.parse({});
    expect(parsed).toEqual({
      companyDescription: null,
      offer: null,
      method: null,
      targetAudience: null,
      websiteUrl: null,
      linkedinUrl: null,
      socialLinks: [],
    });
    expect(DEFAULT_COMPANY_PROFILE).toEqual(parsed);
  });
});
