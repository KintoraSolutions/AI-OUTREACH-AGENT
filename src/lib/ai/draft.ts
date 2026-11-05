import type { AiProvider } from "@/lib/ai/types";
import type {
  DraftClinic,
  DraftFinding,
  DraftResult,
  DraftScoreSummary,
  OrgIdentity,
  OutreachStrategy,
  PersonalizationEvidenceItem,
  StrategySelection,
} from "@/lib/ai/draft-types";
import { buildCitableEvidence, indexByCode } from "@/lib/ai/evidence";
import { selectStrategy } from "@/lib/ai/strategy";
import { validateDraft, type DraftGuardResult } from "@/lib/ai/draft-guard";
import {
  buildDraftUserPrompt,
  DRAFT_PROMPT_VERSION,
  DRAFT_SYSTEM_PROMPT,
  DRAFT_TOOL_DESCRIPTION,
  DRAFT_TOOL_NAME,
  buildDraftToolSchema,
  parseDraftOutput,
} from "@/lib/ai/prompts";
import { DEFAULT_EMAIL_VOICE, type EmailVoice } from "@/lib/ai/email-voice";
import { DEFAULT_COMPANY_PROFILE, type CompanyProfile } from "@/lib/ai/company-profile";
import { wordBandFor } from "@/lib/ai/email-voice";
import { primaryOffering, resolveOrgAiProfile, type OrgAiProfile } from "@/lib/ai/org-ai-profile";
import { getPreset } from "@/lib/ai/presets";
import { buildCategoryLabels, buildServiceLabels } from "@/lib/ai/offering-labels";
import { getUseCase } from "@/lib/ai/use-cases";

/**
 * Two-stage, evidence-grounded draft generation (docs/planning/build-plan.md Section 7). Stage A
 * (`selectStrategy`) picks the strategy from stored scores/findings/overrides.
 * Stage B calls the injected `AiProvider` to write the email using ONLY the
 * chosen observations, then the deterministic guard verifies every claim maps to
 * stored evidence before the result is returned.
 *
 * The provider is injected so this whole function is unit-testable with a fake
 * (and so production always uses the real Anthropic provider — no fake fallback).
 * When evidence is insufficient the model is NOT called at all; the draft is
 * blocked. When the model is unconfigured the provider throws
 * `AiNotConfiguredError`, which the caller surfaces as a configuration state.
 */
export interface GenerateDraftInput {
  clinic: DraftClinic;
  org: OrgIdentity;
  score: DraftScoreSummary;
  findings: DraftFinding[];
  provider: AiProvider;
  /** Org's configured email voice; defaults preserve pre-configuration behavior. */
  voice?: EmailVoice;
  /** Org's company profile (sender context); defaults to no extra context. */
  profile?: CompanyProfile;
  /** Org's AI configuration (offerings, use case, terminology, guardrails). */
  aiProfile?: OrgAiProfile;
}

/**
 * Output ceiling for one draft. A 120-200 word email plus its claim map fits
 * well inside this; it is exported so the pre-launch cost estimate prices the
 * same ceiling the request actually sends.
 */
export const DRAFT_MAX_OUTPUT_TOKENS = 900;

/** Everything Stage A decides, before any model call. */
interface DraftPlan {
  voice: EmailVoice;
  profile: CompanyProfile;
  aiProfile: OrgAiProfile;
  useCase: ReturnType<typeof getUseCase>;
  wordBand: ReturnType<typeof wordBandFor>;
  citable: ReturnType<typeof buildCitableEvidence>;
  selection: StrategySelection;
}

/**
 * Stage A in one place: resolve the org's configuration and pick the strategy.
 *
 * Extracted so `previewDraftPrompt` can measure exactly the prompt
 * `generateDraft` would send. Two copies of this would let the cost estimate
 * drift away from the request it is estimating.
 */
function planDraft(input: Omit<GenerateDraftInput, "provider">): DraftPlan {
  const voice = input.voice ?? DEFAULT_EMAIL_VOICE;
  const profile = input.profile ?? DEFAULT_COMPANY_PROFILE;
  const aiProfile = input.aiProfile ?? resolveOrgAiProfile({ preset: getPreset(null) });
  const useCase = getUseCase(aiProfile.useCase);
  const wordBand = wordBandFor(voice);

  const citable = buildCitableEvidence(input.findings);
  const selection = selectStrategy(input.score, citable, {
    policy: useCase.evidencePolicy,
    primarySlot: primaryOffering(aiProfile)?.slot ?? null,
    // So the stored explanation uses the org's own names, not a product name.
    categoryLabels: buildCategoryLabels(aiProfile),
    serviceLabels: buildServiceLabels(aiProfile),
  });

  return { voice, profile, aiProfile, useCase, wordBand, citable, selection };
}

/**
 * The exact system + user prompt `generateDraft` would send for this input,
 * built without touching a provider. Returns null when the draft would be
 * blocked before any model call, which is also when it would cost nothing.
 */
export function previewDraftPrompt(
  input: Omit<GenerateDraftInput, "provider">,
): { system: string; prompt: string } | null {
  const plan = planDraft(input);
  if (plan.selection.strategy === "INSUFFICIENT") return null;

  return {
    system: DRAFT_SYSTEM_PROMPT,
    prompt: buildDraftUserPrompt({
      strategy: plan.selection.strategy as Exclude<OutreachStrategy, "INSUFFICIENT">,
      org: input.org,
      clinic: input.clinic,
      evidence: plan.selection.supportingEvidence,
      voice: plan.voice,
      profile: plan.profile,
      aiProfile: plan.aiProfile,
      useCase: plan.useCase,
    }),
  };
}

export async function generateDraft(input: GenerateDraftInput): Promise<DraftResult> {
  const { clinic, org, findings, provider } = input;
  const { voice, profile, aiProfile, useCase, wordBand, citable, selection } = planDraft(input);

  const base = {
    service: selection.service,
    strategy: selection.strategy,
    strategyReason: selection.reason,
    promptVersion: DRAFT_PROMPT_VERSION,
    aiModel: provider.model,
    aiProvider: provider.name,
  };

  // Insufficient evidence: block WITHOUT calling the model (never fabricate).
  if (selection.strategy === "INSUFFICIENT") {
    return {
      ...base,
      status: "BLOCKED",
      subject: "",
      body: "",
      personalizationEvidence: [],
      claimMap: [],
      evidenceFindingIds: [],
      evidenceSourceUrls: [],
      reviewWarnings: [],
      blockedReason: selection.reason,
      confidence: 0,
      wordCount: 0,
    };
  }

  const strategy = selection.strategy as Exclude<OutreachStrategy, "INSUFFICIENT">;
  const userPrompt = buildDraftUserPrompt({
    strategy,
    org,
    clinic,
    evidence: selection.supportingEvidence,
    voice,
    profile,
    aiProfile,
    useCase,
  });

  const output = await provider.generateStructured({
    system: DRAFT_SYSTEM_PROMPT,
    prompt: userPrompt,
    toolName: DRAFT_TOOL_NAME,
    toolDescription: DRAFT_TOOL_DESCRIPTION,
    schema: buildDraftToolSchema(wordBand),
    parse: parseDraftOutput,
    maxTokens: DRAFT_MAX_OUTPUT_TOKENS,
  });

  const citableByCode = indexByCode(citable);
  const dismissedCodes = new Set(findings.filter((f) => f.dismissed).map((f) => f.code));

  const guard = validateDraft({
    output,
    clinicName: clinic.name,
    strategy,
    citableByCode,
    dismissedCodes,
    wordBand,
    // Links the pitched offering(s) asked the model to include.
    expectedLinks: expectedLinksFor(aiProfile, strategy, selection.supportingEvidence),
    blockPhi: useCase.key === "patient_referral",
  });

  const personalizationEvidence: PersonalizationEvidenceItem[] = guard.usedEvidence.map((e) => ({
    findingId: e.findingId,
    code: e.code,
    category: e.category,
    claim: guard.claimMap.find((c) => c.code === e.code)?.claim ?? e.observation,
    sourceUrl: e.sourceUrl,
    confidence: e.confidence,
    isFact: e.isFact,
  }));

  const warnings = [...guard.warnings];
  if (!clinic.recipientEmail) {
    warnings.push("No verified recipient email; add one before sending.");
  }

  return {
    ...base,
    status: guard.blocked ? "BLOCKED" : "GENERATED",
    subject: output.subject,
    body: output.body,
    personalizationEvidence,
    claimMap: guard.claimMap,
    evidenceFindingIds: personalizationEvidence.map((e) => e.findingId),
    evidenceSourceUrls: [...new Set(personalizationEvidence.map((e) => e.sourceUrl))],
    reviewWarnings: warnings,
    blockedReason: guard.blocked ? guard.blockedReasons.join(" ") : null,
    confidence: computeConfidence(selection, guard),
    wordCount: guard.wordCount,
  };
}

/**
 * Proof links the prompt asked the model to include, so the guard can warn when
 * one is missing. Generalizes the old "portfolio link on a website pitch" check.
 */
function expectedLinksFor(
  aiProfile: OrgAiProfile,
  strategy: Exclude<OutreachStrategy, "INSUFFICIENT">,
  evidence: PersonalizationEvidenceItem[] | { category: string }[],
): string[] {
  const slots =
    strategy === "COMBINED"
      ? [...new Set(evidence.map((e) => e.category))].filter(
          (c): c is "WEBSITE" | "SOFTWARE" | "KLEARQ" =>
            c === "WEBSITE" || c === "SOFTWARE" || c === "KLEARQ",
        )
      : [strategy];
  const links = slots
    .map((s) => aiProfile.offerings.find((o) => o.slot === s && o.enabled)?.proofUrl)
    .filter((u): u is string => Boolean(u));
  if (links.length) return links;
  const primary = aiProfile.offerings.find((o) => o.key === aiProfile.primaryOfferingKey);
  return primary?.proofUrl ? [primary.proofUrl] : [];
}

/** Draft-level confidence (0-100) from the evidence mix and warning count. */
function computeConfidence(selection: StrategySelection, guard: DraftGuardResult): number {
  const supporting = selection.supportingEvidence;
  if (supporting.length === 0) return 0;
  const factShare = supporting.filter((e) => e.isFact).length / supporting.length;
  let c = Math.round(35 + 55 * factShare); // 35 (all inference) .. 90 (all facts)
  c -= guard.warnings.length * 3;
  if (guard.blocked) c = Math.min(c, 20);
  return Math.max(0, Math.min(100, c));
}
