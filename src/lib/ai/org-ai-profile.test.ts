import { describe, expect, it } from "vitest";
import {
  buildLegacyOfferings,
  effectiveGuardrails,
  normalizeOfferings,
  offeringForSlot,
  orgAiProfileSchema,
  primaryOffering,
  resolveOrgAiProfile,
  slotName,
  slotShortLabel,
  type OrgAiProfile,
} from "@/lib/ai/org-ai-profile";
import { getPreset } from "@/lib/ai/presets";
import { getUseCase } from "@/lib/ai/use-cases";

const general = getPreset("general");
const healthcare = getPreset("healthcare");

describe("resolveOrgAiProfile", () => {
  it("falls back to the preset when nothing is stored", () => {
    const p = resolveOrgAiProfile({ preset: general });
    expect(p.presetKey).toBe("general");
    expect(p.useCase).toBe("service_pitch");
    expect(p.offerings.map((o) => o.slot)).toEqual(["WEBSITE", "SOFTWARE", "KLEARQ"]);
  });

  it("lets stored edits win over inferred, and inferred win over the preset", () => {
    const p = resolveOrgAiProfile({
      preset: general,
      inferred: { useCase: "patient_referral", terminology: ["inferred"] },
      stored: { terminology: ["mine"] },
    });
    // stored wins for terminology, inferred still supplies the use case
    expect(p.terminology).toEqual(["mine"]);
    expect(p.useCase).toBe("patient_referral");
  });

  it("replaces offerings wholesale from the highest layer that has any", () => {
    const p = resolveOrgAiProfile({
      preset: general,
      stored: {
        offerings: [
          { key: "physio", slot: null, name: "Physiotherapy", shortLabel: "PHYS", description: null, pitchGuidance: null, proofUrl: null, enabled: true },
        ],
      },
    });
    expect(p.offerings).toHaveLength(1);
    expect(p.offerings[0]!.name).toBe("Physiotherapy");
  });

  it("picks a valid primary offering when the stored key is stale", () => {
    const p = resolveOrgAiProfile({
      preset: general,
      stored: { primaryOfferingKey: "does-not-exist" },
    });
    expect(p.offerings.some((o) => o.key === p.primaryOfferingKey)).toBe(true);
  });
});

describe("normalizeOfferings", () => {
  it("de-duplicates keys and keeps only the first enabled offering per slot", () => {
    const out = normalizeOfferings([
      { key: "a", slot: "WEBSITE", name: "First", enabled: true },
      { key: "a", slot: "WEBSITE", name: "Second", enabled: true },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.key).not.toBe(out[1]!.key);
    // Only one enabled owner per slot, so label resolution is deterministic.
    expect(out.filter((o) => o.slot === "WEBSITE" && o.enabled)).toHaveLength(1);
  });

  it("derives a key and short label when they are missing", () => {
    const out = normalizeOfferings([{ slot: null, name: "Sports Medicine", enabled: true }]);
    expect(out[0]!.key).toBe("sports-medicine");
    expect(out[0]!.shortLabel).toBeTruthy();
  });

  it("drops empty entries", () => {
    expect(normalizeOfferings([{ name: "" }, null as never])).toEqual([]);
  });
});

describe("slot labels", () => {
  it("uses the org's offering name when one is bound to the slot", () => {
    const p = resolveOrgAiProfile({
      preset: general,
      stored: {
        offerings: [
          { key: "callflow", slot: "KLEARQ", name: "Call Flow", shortLabel: "CALL", description: null, pitchGuidance: null, proofUrl: null, enabled: true },
        ],
      },
    });
    expect(slotName(p, "KLEARQ")).toBe("Call Flow");
    expect(slotShortLabel(p, "KLEARQ")).toBe("CALL");
  });

  it("falls back to the neutral area name, never a product name", () => {
    // The healthcare preset's offerings are slot-free, so the recipient-facing
    // scoring areas must keep their generic names.
    const p = resolveOrgAiProfile({ preset: healthcare });
    expect(slotName(p, "WEBSITE")).toBe("Website");
    expect(slotName(p, "KLEARQ")).toBe("Phone operations");
    expect(offeringForSlot(p, "WEBSITE")).toBeNull();
  });
});

describe("effectiveGuardrails", () => {
  it("always includes preset and use-case guardrails, even when the org stores none", () => {
    const p = resolveOrgAiProfile({ preset: healthcare, stored: { customGuardrails: [] } });
    const rules = effectiveGuardrails(p, getUseCase("patient_referral"));
    expect(rules.join(" ")).toMatch(/protected health information/i);
  });

  it("cannot be weakened by the org: custom rules are added, never subtracted", () => {
    const p = resolveOrgAiProfile({
      preset: healthcare,
      stored: { customGuardrails: ["Never mention pricing."] },
    });
    const rules = effectiveGuardrails(p, getUseCase("patient_referral"));
    expect(rules).toContain("Never mention pricing.");
    expect(rules.join(" ")).toMatch(/protected health information/i);
    expect(rules.length).toBeGreaterThan(1);
  });
});

describe("legacy backfill", () => {
  it("carries a pre-profile product name and portfolio link into offerings", () => {
    const offerings = buildLegacyOfferings(
      { klearqProductName: "KlearQ", klearqTagline: "Phone queue management", portfolioUrl: "https://acme.example/work" },
      general,
    );
    const phone = offerings.find((o) => o.slot === "KLEARQ")!;
    const web = offerings.find((o) => o.slot === "WEBSITE")!;
    expect(phone.name).toBe("KlearQ");
    expect(phone.description).toBe("Phone queue management");
    expect(web.proofUrl).toBe("https://acme.example/work");
  });

  it("leaves the neutral names in place when there is nothing legacy to carry", () => {
    const offerings = buildLegacyOfferings(
      { klearqProductName: null, klearqTagline: null, portfolioUrl: null },
      general,
    );
    expect(offerings.find((o) => o.slot === "KLEARQ")!.name).toBe("Phone operations");
  });
});

describe("orgAiProfileSchema", () => {
  it("parses an empty object into a usable profile shape", () => {
    const parsed = orgAiProfileSchema.parse({});
    expect(parsed.offerings).toEqual([]);
    expect(parsed.customGuardrails).toEqual([]);
    expect(parsed.learned.feedbackCount).toBe(0);
  });

  it("degrades bad enum values instead of throwing", () => {
    const parsed = orgAiProfileSchema.parse({ industry: "nope", useCase: "nope" });
    expect(parsed.industry).toBe("general");
    expect(parsed.useCase).toBe("service_pitch");
  });

  it("coerces an unknown offering slot to null rather than failing", () => {
    const parsed = orgAiProfileSchema.parse({
      offerings: [{ key: "x", slot: "MADE_UP", name: "X", enabled: true }],
    });
    expect(parsed.offerings[0]!.slot).toBeNull();
  });

  it("round-trips a resolved profile", () => {
    const p: OrgAiProfile = resolveOrgAiProfile({ preset: healthcare });
    expect(() => orgAiProfileSchema.parse(p)).not.toThrow();
    expect(primaryOffering(p)?.name).toBe("Primary clinical service");
  });
});
