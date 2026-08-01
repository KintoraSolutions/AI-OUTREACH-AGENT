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
  DRAFT_TOOL_SCHEMA,
  parseDraftOutput,
} from "@/lib/ai/prompts";

/**
 * Two-stage, evidence-grounded draft generation (plan.md Section 7). Stage A
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
}

export async function generateDraft(input: GenerateDraftInput): Promise<DraftResult> {
  const { clinic, org, score, findings, provider } = input;

  const citable = buildCitableEvidence(findings);
  const selection = selectStrategy(score, citable);

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
  });

  const output = await provider.generateStructured({
    system: DRAFT_SYSTEM_PROMPT,
    prompt: userPrompt,
    toolName: DRAFT_TOOL_NAME,
    toolDescription: DRAFT_TOOL_DESCRIPTION,
    schema: DRAFT_TOOL_SCHEMA,
    parse: parseDraftOutput,
    maxTokens: 900,
  });

  const citableByCode = indexByCode(citable);
  const dismissedCodes = new Set(findings.filter((f) => f.dismissed).map((f) => f.code));

  const guard = validateDraft({
    output,
    clinicName: clinic.name,
    org,
    strategy,
    citableByCode,
    dismissedCodes,
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
