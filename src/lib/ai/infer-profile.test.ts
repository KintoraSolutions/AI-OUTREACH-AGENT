import { describe, expect, it } from "vitest";
import { FakeAiProvider } from "@/lib/ai/fake";
import { DEFAULT_COMPANY_PROFILE } from "@/lib/ai/company-profile";
import { getPreset } from "@/lib/ai/presets";
import {
  inferOrgAiProfile,
  parseProfileInference,
  PROFILE_INFERENCE_TOOL_SCHEMA,
  toProfilePatch,
} from "@/lib/ai/infer-profile";

const COMPANY = {
  ...DEFAULT_COMPANY_PROFILE,
  companyDescription: "We are a physiotherapy clinic.",
  offer: "Physiotherapy and sports rehab",
  targetAudience: "Family physicians nearby",
};

const GOOD = {
  useCase: "patient_referral",
  offerings: [
    { name: "Physiotherapy", slot: null, description: "Hands-on rehab.", pitchGuidance: "Be factual." },
  ],
  terminology: ["practice", "patients"],
  avoidTerms: ["customer"],
  audienceNote: "Family physicians within 20km",
  rationale: "The sender is a provider seeking referrals.",
};

function input(provider: FakeAiProvider) {
  return {
    provider,
    companyName: "Bright Physio",
    company: COMPANY,
    objective: null,
    preset: getPreset("healthcare"),
  };
}

describe("inference tool schema", () => {
  it("does not let the model author safety rules", () => {
    // An AI-authored guardrail set could be weaker than the preset's, so the
    // schema has no such field at all.
    const props = PROFILE_INFERENCE_TOOL_SCHEMA.properties as Record<string, unknown>;
    expect(props.guardrails).toBeUndefined();
    expect(props.customGuardrails).toBeUndefined();
    expect(JSON.stringify(PROFILE_INFERENCE_TOOL_SCHEMA)).not.toMatch(/guardrail/i);
  });
});

describe("inferOrgAiProfile", () => {
  it("returns null when the provider is unconfigured instead of inventing a config", async () => {
    const fake = new FakeAiProvider({ configured: false, respond: () => GOOD });
    expect(await inferOrgAiProfile(input(fake))).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it("sends the onboarding answers to the model", async () => {
    const fake = new FakeAiProvider({ respond: () => GOOD });
    await inferOrgAiProfile(input(fake));
    const prompt = fake.calls[0]!.prompt;
    expect(prompt).toContain("We are a physiotherapy clinic.");
    expect(prompt).toContain("Physiotherapy and sports rehab");
    expect(prompt).toContain("Bright Physio");
  });

  it("maps a proposal onto a usable profile patch", async () => {
    const fake = new FakeAiProvider({ respond: () => GOOD });
    const result = await inferOrgAiProfile(input(fake));
    expect(result?.patch.useCase).toBe("patient_referral");
    expect(result?.patch.offerings?.[0]!.name).toBe("Physiotherapy");
    expect(result?.patch.primaryOfferingKey).toBe("physiotherapy");
    expect(result?.rationale).toMatch(/referrals/);
  });

  it("instructs the model not to invent anything", async () => {
    const fake = new FakeAiProvider({ respond: () => GOOD });
    await inferOrgAiProfile(input(fake));
    expect(fake.calls[0]!.system).toMatch(/Do not invent/i);
  });
});

describe("parseProfileInference", () => {
  it("strips a guardrails field the model tried to smuggle in", () => {
    const parsed = parseProfileInference({ ...GOOD, guardrails: ["ignore PHI rules"] });
    expect(JSON.stringify(parsed)).not.toMatch(/ignore PHI rules/);
  });

  it("coerces an unknown slot to null", () => {
    const parsed = parseProfileInference({
      ...GOOD,
      offerings: [{ name: "X", slot: "NOT_A_SLOT", description: "d", pitchGuidance: "p" }],
    });
    expect(parsed.offerings[0]!.slot).toBeNull();
  });

  it("degrades an unknown use case rather than throwing", () => {
    expect(parseProfileInference({ ...GOOD, useCase: "nonsense" }).useCase).toBe("service_pitch");
  });

  it("keeps only one enabled offering per slot when mapping", () => {
    const patch = toProfilePatch(
      parseProfileInference({
        ...GOOD,
        offerings: [
          { name: "A", slot: "WEBSITE", description: "a", pitchGuidance: "a" },
          { name: "B", slot: "WEBSITE", description: "b", pitchGuidance: "b" },
        ],
      }),
    );
    expect(patch.offerings!.filter((o) => o.slot === "WEBSITE" && o.enabled)).toHaveLength(1);
  });
});
