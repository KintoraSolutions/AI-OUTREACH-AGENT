import { FindingCategory, RecommendedService } from "@prisma/client";
import type {
  DraftScoreSummary,
  EvidenceItem,
  OutreachStrategy,
  StrategySelection,
} from "@/lib/ai/draft-types";
import { SERVICE_LABELS } from "@/lib/leads/constants";

/**
 * Stage A (plan.md Section 7): choose and explain the strongest outreach
 * strategy from the stored score, recommendation, findings, and any manual
 * override. Pure and deterministic.
 *
 * Key rules:
 *  - The EFFECTIVE service (override-aware) drives the strategy, so a human
 *    override is honored.
 *  - But an override is NOT itself evidence: the strategy can only proceed if
 *    there is citable evidence in the chosen opportunity area(s). If an override
 *    selects a service with no supporting evidence, the result is INSUFFICIENT
 *    (the draft will be blocked), never a fabricated pitch.
 *  - COMBINED pitches only the two strongest areas that actually have evidence,
 *    and never forces all services into one email.
 */

const SERVICE_TO_CATEGORY: Partial<Record<RecommendedService, FindingCategory>> = {
  WEBSITE: FindingCategory.WEBSITE,
  SOFTWARE: FindingCategory.SOFTWARE,
  KLEARQ: FindingCategory.KLEARQ,
};

const CATEGORY_LABEL: Record<string, string> = {
  WEBSITE: "website",
  SOFTWARE: "custom software",
  KLEARQ: "KlearQ phone management",
};

export function selectStrategy(
  score: DraftScoreSummary,
  citableEvidence: EvidenceItem[],
): StrategySelection {
  const overrideApplied = score.manualOverride && score.effectiveService !== score.computedService;
  const service = score.effectiveService;

  const evidenceFor = (cat: FindingCategory) =>
    citableEvidence.filter((e) => e.category === cat);

  // Insufficient evidence: the score itself recommends nothing actionable.
  if (service === RecommendedService.NONE) {
    return insufficient(
      overrideApplied
        ? "A manual override was set to no service. There is not enough supported evidence to ground a specific pitch."
        : "The strongest opportunity is below the recommendation threshold, so there is not enough supported evidence to pitch a specific service.",
    );
  }

  if (service === RecommendedService.COMBINED) {
    const ranked = [
      { cat: FindingCategory.WEBSITE, subtotal: score.websiteScore, svc: RecommendedService.WEBSITE },
      { cat: FindingCategory.SOFTWARE, subtotal: score.softwareScore, svc: RecommendedService.SOFTWARE },
      { cat: FindingCategory.KLEARQ, subtotal: score.klearqScore, svc: RecommendedService.KLEARQ },
    ].sort((a, b) => b.subtotal - a.subtotal);

    const withEvidence = ranked.filter((t) => evidenceFor(t.cat).length > 0);
    if (withEvidence.length === 0) {
      return insufficient(
        "A combined opportunity was indicated, but there is no citable evidence to support it.",
      );
    }
    // Only justify COMBINED when two areas actually have supported evidence; if
    // just one does, pitch that single area rather than forcing a combined offer.
    if (withEvidence.length === 1) {
      const only = withEvidence[0]!;
      const supporting = evidenceFor(only.cat);
      return {
        strategy: only.svc as OutreachStrategy,
        service: only.svc,
        reason: `A combined opportunity was indicated, but only ${CATEGORY_LABEL[only.cat]} has supported evidence, so the pitch focuses there.${overrideNote(overrideApplied)}`,
        supportingEvidence: sortStrong(supporting),
        overrideApplied,
        onlyInference: supporting.every((e) => !e.isFact),
      };
    }

    const top2 = withEvidence.slice(0, 2);
    const supporting = top2.flatMap((t) => evidenceFor(t.cat));
    const areas = top2.map((t) => CATEGORY_LABEL[t.cat]);
    return {
      strategy: "COMBINED",
      service: RecommendedService.COMBINED,
      reason: `Two opportunity areas (${areas.join(" and ")}) both have supported evidence, so a combined pitch is warranted.${overrideNote(overrideApplied)}`,
      supportingEvidence: sortStrong(supporting),
      overrideApplied,
      onlyInference: supporting.every((e) => !e.isFact),
    };
  }

  const cat = SERVICE_TO_CATEGORY[service];
  if (!cat) return insufficient("No opportunity area maps to the selected service.");

  const supporting = evidenceFor(cat);
  if (supporting.length === 0) {
    return insufficient(
      overrideApplied
        ? `A manual override selected ${SERVICE_LABELS[service]}, but there is no citable ${CATEGORY_LABEL[cat]} evidence to ground that pitch. An override does not by itself create evidence.`
        : `${SERVICE_LABELS[service]} is recommended, but no citable ${CATEGORY_LABEL[cat]} evidence is available to ground a specific email.`,
    );
  }

  return {
    strategy: service as OutreachStrategy,
    service,
    reason: `${SERVICE_LABELS[service]} is the strongest supported opportunity, grounded in ${supporting.length} observation(s).${overrideNote(overrideApplied)}`,
    supportingEvidence: sortStrong(supporting),
    overrideApplied,
    onlyInference: supporting.every((e) => !e.isFact),
  };
}

function overrideNote(overrideApplied: boolean): string {
  return overrideApplied
    ? " (Service was set by a manual override; the observations below come from stored evidence, not the override.)"
    : "";
}

function insufficient(reason: string): StrategySelection {
  return {
    strategy: "INSUFFICIENT",
    service: RecommendedService.NONE,
    reason,
    supportingEvidence: [],
    overrideApplied: false,
    onlyInference: false,
  };
}

/** Facts first, then strong inferences; keep to at most a handful for the email. */
function sortStrong(items: EvidenceItem[]): EvidenceItem[] {
  return [...items].sort((a, b) => Number(b.isFact) - Number(a.isFact));
}
