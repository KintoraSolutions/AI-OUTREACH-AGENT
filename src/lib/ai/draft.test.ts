import { describe, expect, it } from "vitest";
import { Confidence, FindingCategory, RecommendedService, ScoreConfidence } from "@prisma/client";
import { generateDraft } from "@/lib/ai/draft";
import { FakeAiProvider } from "@/lib/ai/fake";
import { AnthropicAiProvider, DEFAULT_AI_MODEL } from "@/lib/ai/anthropic";
import { getAiProvider } from "@/lib/ai/provider";
import { AiNotConfiguredError } from "@/lib/ai/errors";
import type { DraftClinic, DraftFinding, DraftScoreSummary, OrgIdentity } from "@/lib/ai/draft-types";
import { DEFAULT_EMAIL_VOICE } from "@/lib/ai/email-voice";
import { DEFAULT_COMPANY_PROFILE } from "@/lib/ai/company-profile";

const ORG: OrgIdentity = {
  companyName: "Acme Studio",
  portfolioUrl: "https://acme.example/work",
  contactUrl: "https://acme.example/contact",
  senderName: "Sam",
  senderEmail: "sam@acme.example",
};

const CLINIC: DraftClinic = {
  name: "Bright Dental",
  recipientName: "Dr. Lee",
  recipientEmail: "hello@bright.example",
};

function finding(
  code: string,
  category: FindingCategory,
  confidence: Confidence,
  isFact: boolean,
  dismissed = false,
): DraftFinding {
  return {
    id: `${code}-id`,
    code,
    category,
    finding: `Finding ${code}`,
    evidence: `Evidence ${code}`,
    sourceUrl: "https://bright.example/page",
    confidence,
    isFact,
    dismissed,
  };
}

const WEBSITE_FINDINGS: DraftFinding[] = [
  finding("web_missing_https", FindingCategory.WEBSITE, Confidence.VERIFIED, true),
  finding("web_no_booking_cta", FindingCategory.WEBSITE, Confidence.STRONG_INFERENCE, false),
  finding("web_missing_location", FindingCategory.WEBSITE, Confidence.WEAK_INFERENCE, false), // weak: excluded
  finding("web_poor_performance", FindingCategory.WEBSITE, Confidence.STRONG_INFERENCE, false, true), // dismissed
];

function websiteScore(partial: Partial<DraftScoreSummary> = {}): DraftScoreSummary {
  return {
    effectiveService: RecommendedService.WEBSITE,
    computedService: RecommendedService.WEBSITE,
    confidence: ScoreConfidence.MEDIUM,
    websiteScore: 14,
    softwareScore: 0,
    klearqScore: 0,
    manualOverride: false,
    ...partial,
  };
}

const GOOD_BODY =
  "Hello Dr. Lee, I recently looked through the Bright Dental website and noticed there is no clear online booking option for new patients. A clearer booking path can help more visitors turn into booked appointments without extra phone calls. We design healthcare websites focused on exactly that, and you can browse a few examples in our portfolio at https://acme.example/work. If it is useful, I would be glad to share a couple of specific ideas for Bright Dental. Would you be open to a short call sometime next week? Thanks very much for your time, and there is no pressure either way. Best regards, Sam";

function goodDraft(code = "web_no_booking_cta") {
  return {
    subject: "A quick note about the Bright Dental website",
    body: GOOD_BODY,
    observationsUsed: [code],
    claims: [{ text: "there is no clear online booking option", evidenceCode: code }],
  };
}

describe("generateDraft (engine)", () => {
  it("drafts from stored evidence only, blocking weak/dismissed findings from the prompt", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    const res = await generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings: WEBSITE_FINDINGS, provider: fake });

    expect(res.status).toBe("GENERATED");
    expect(res.service).toBe(RecommendedService.WEBSITE);
    expect(res.promptVersion).toBe("draft-v3");
    expect(res.aiProvider).toBe("fake");
    expect(res.personalizationEvidence.map((e) => e.code)).toContain("web_no_booking_cta");

    const prompt = fake.calls[0]!.prompt;
    expect(prompt).toContain("web_no_booking_cta");
    expect(prompt).toContain("web_missing_https"); // verified fact is citable
    expect(prompt).not.toContain("web_missing_location"); // weak inference excluded
    expect(prompt).not.toContain("web_poor_performance"); // dismissed excluded
  });

  it("applies the configured email voice (tone, length, objective, signature, instructions)", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    await generateDraft({
      clinic: CLINIC,
      org: ORG,
      score: websiteScore(),
      findings: WEBSITE_FINDINGS,
      provider: fake,
      voice: {
        ...DEFAULT_EMAIL_VOICE,
        tone: "warm",
        length: "short",
        objective: "book a short intro call",
        signatureEnabled: true,
        senderTitle: "Founder",
        signOff: "Cheers,",
        customInstructions: "Never mention pricing.",
      },
    });

    const prompt = fake.calls[0]!.prompt;
    expect(prompt).toContain("Warm and friendly");
    expect(prompt).toContain("60 to 100 words");
    expect(prompt).toContain("book a short intro call");
    expect(prompt).toContain("Never mention pricing.");
    // Signature is built from org.senderName + configured title + company.
    expect(prompt).toContain("Cheers,");
    expect(prompt).toContain("Sam, Founder");
    expect(prompt).toContain("Acme Studio");
  });

  it("feeds the company profile as sender context and prefers its offer over the voice value prop", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    await generateDraft({
      clinic: CLINIC,
      org: ORG,
      score: websiteScore(),
      findings: WEBSITE_FINDINGS,
      provider: fake,
      voice: { ...DEFAULT_EMAIL_VOICE, valueProp: "voice-level offer line" },
      profile: {
        ...DEFAULT_COMPANY_PROFILE,
        companyDescription: "We help clinics grow online.",
        offer: "Custom booking software",
        method: "We audit then build.",
        targetAudience: "Independent clinics",
        websiteUrl: "https://acme.example",
      },
    });

    const prompt = fake.calls[0]!.prompt;
    expect(prompt).toContain("About the sender");
    expect(prompt).toContain("We help clinics grow online.");
    expect(prompt).toContain("We audit then build.");
    expect(prompt).toContain("Independent clinics");
    // profile.offer takes precedence over voice.valueProp for the offer line.
    expect(prompt).toContain("Custom booking software");
    expect(prompt).not.toContain("voice-level offer line");
  });

  it("falls back to the email-voice value prop for the offer line when the profile has no offer", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    await generateDraft({
      clinic: CLINIC,
      org: ORG,
      score: websiteScore(),
      findings: WEBSITE_FINDINGS,
      provider: fake,
      voice: { ...DEFAULT_EMAIL_VOICE, valueProp: "voice-level offer line" },
      profile: { ...DEFAULT_COMPANY_PROFILE }, // no profile.offer -> fall back to valueProp
    });
    const prompt = fake.calls[0]!.prompt;
    expect(prompt).toContain("What the sender offers");
    expect(prompt).toContain("voice-level offer line");
  });

  it("adds no sender-background block when the company profile is empty", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    await generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings: WEBSITE_FINDINGS, provider: fake });
    expect(fake.calls[0]!.prompt).not.toContain("About the sender");
  });

  it("omits the signature block when the voice disables it", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    await generateDraft({
      clinic: CLINIC,
      org: ORG,
      score: websiteScore(),
      findings: WEBSITE_FINDINGS,
      provider: fake,
      voice: { ...DEFAULT_EMAIL_VOICE, signatureEnabled: false },
    });
    expect(fake.calls[0]!.prompt).not.toContain("End the email with exactly this sign-off");
  });

  it("rejects a claim with no supporting evidence (blocks the draft)", async () => {
    const fake = new FakeAiProvider({
      respond: () => ({ ...goodDraft(), claims: [{ text: "made up", evidenceCode: "totally_made_up" }] }),
    });
    const res = await generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings: WEBSITE_FINDINGS, provider: fake });
    expect(res.status).toBe("BLOCKED");
    expect(res.blockedReason).toMatch(/does not exist or is not sufficiently supported/i);
  });

  it("rejects a claim based on a dismissed finding", async () => {
    const fake = new FakeAiProvider({
      respond: () => ({ ...goodDraft(), claims: [{ text: "slow site", evidenceCode: "web_poor_performance" }] }),
    });
    const res = await generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings: WEBSITE_FINDINGS, provider: fake });
    expect(res.status).toBe("BLOCKED");
    expect(res.blockedReason).toMatch(/dismissed finding/i);
  });

  it("blocks (without calling the model) when only weak evidence exists", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    const findings = [finding("web_missing_location", FindingCategory.WEBSITE, Confidence.WEAK_INFERENCE, false)];
    const res = await generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings, provider: fake });
    expect(res.status).toBe("BLOCKED");
    expect(fake.calls).toHaveLength(0);
  });

  it("warns when the wording rests only on inference-level evidence", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft("web_no_booking_cta") });
    const findings = [finding("web_no_booking_cta", FindingCategory.WEBSITE, Confidence.STRONG_INFERENCE, false)];
    const res = await generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings, provider: fake });
    expect(res.status).toBe("GENERATED");
    expect(res.reviewWarnings.some((w) => /inference-level/i.test(w))).toBe(true);
  });

  it("does not let a manual override manufacture a pitch when there is no supporting evidence", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    const res = await generateDraft({
      clinic: CLINIC,
      org: ORG,
      score: websiteScore({
        effectiveService: RecommendedService.KLEARQ,
        computedService: RecommendedService.WEBSITE,
        manualOverride: true,
      }),
      findings: WEBSITE_FINDINGS, // no KlearQ evidence
      provider: fake,
    });
    expect(res.status).toBe("BLOCKED");
    expect(fake.calls).toHaveLength(0);
  });

  it("supports a combined pitch when two areas both have evidence", async () => {
    const fake = new FakeAiProvider({
      respond: () => ({
        subject: "Ideas for Bright Dental",
        body: GOOD_BODY.replace("Best regards", "We also build custom intake tools for multi-location clinics. Best regards"),
        observationsUsed: ["web_no_booking_cta", "sw_multiple_locations"],
        claims: [
          { text: "no clear online booking", evidenceCode: "web_no_booking_cta" },
          { text: "multiple locations", evidenceCode: "sw_multiple_locations" },
        ],
      }),
    });
    const findings = [
      finding("web_no_booking_cta", FindingCategory.WEBSITE, Confidence.STRONG_INFERENCE, false),
      finding("sw_multiple_locations", FindingCategory.SOFTWARE, Confidence.VERIFIED, true),
    ];
    const res = await generateDraft({
      clinic: CLINIC,
      org: ORG,
      score: websiteScore({ effectiveService: RecommendedService.COMBINED, websiteScore: 12, softwareScore: 10 }),
      findings,
      provider: fake,
    });
    expect(res.service).toBe(RecommendedService.COMBINED);
    expect(res.status).toBe("GENERATED");
    expect(res.personalizationEvidence).toHaveLength(2);
  });

  it("blocks with insufficient evidence when nothing is recommended", async () => {
    const fake = new FakeAiProvider({ respond: () => goodDraft() });
    const res = await generateDraft({
      clinic: CLINIC,
      org: ORG,
      score: websiteScore({ effectiveService: RecommendedService.NONE }),
      findings: [],
      provider: fake,
    });
    expect(res.status).toBe("BLOCKED");
    expect(fake.calls).toHaveLength(0);
  });

  it("blocks when the body drops the exact clinic name", async () => {
    const fake = new FakeAiProvider({
      respond: () => ({ ...goodDraft(), body: GOOD_BODY.replaceAll("Bright Dental", "your clinic") }),
    });
    const res = await generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings: WEBSITE_FINDINGS, provider: fake });
    expect(res.status).toBe("BLOCKED");
    expect(res.blockedReason).toMatch(/exact name/i);
  });

  it("propagates a provider configuration failure instead of faking output", async () => {
    const fake = new FakeAiProvider({ configured: false, respond: () => goodDraft() });
    await expect(
      generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings: WEBSITE_FINDINGS, provider: fake }),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("enforces structured output validation (invalid model output rejects)", async () => {
    const fake = new FakeAiProvider({ respond: () => ({ subject: "only a subject" }) });
    await expect(
      generateDraft({ clinic: CLINIC, org: ORG, score: websiteScore(), findings: WEBSITE_FINDINGS, provider: fake }),
    ).rejects.toThrow();
  });
});

describe("Anthropic provider configuration", () => {
  it("reports unconfigured without a key and throws rather than returning fake output", async () => {
    const p = new AnthropicAiProvider();
    expect(p.isConfigured()).toBe(false);
    await expect(
      p.generateStructured({
        system: "",
        prompt: "",
        toolName: "t",
        toolDescription: "d",
        schema: { type: "object" },
        parse: (x) => x,
      }),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("uses the real provider (never a fake) and a configurable, non-hardcoded model", () => {
    expect(getAiProvider().name).toBe("anthropic");
    expect(DEFAULT_AI_MODEL).toBe("claude-sonnet-5");
  });
});
