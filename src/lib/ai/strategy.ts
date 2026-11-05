import { FindingCategory, RecommendedService } from "@prisma/client";
import type {
  DraftScoreSummary,
  EvidenceItem,
  OutreachStrategy,
  StrategySelection,
} from "@/lib/ai/draft-types";
import { FINDING_CATEGORY_LABELS, SERVICE_LABELS } from "@/lib/leads/constants";
import type { OfferingSlot } from "@/lib/ai/org-ai-profile";
import type { EvidencePolicy } from "@/lib/ai/use-cases";

/**
 * Stage A (docs/planning/build-plan.md Section 7): choose and explain the strongest outreach
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

/**
 * Area names used in the stored `strategyReason`. Neutral by default and
 * overridable from the org's AI profile, so a saved explanation never carries a
 * product name the organization does not use.
 */
const DEFAULT_CATEGORY_LABEL: Record<string, string> = {
  WEBSITE: FINDING_CATEGORY_LABELS.WEBSITE.toLowerCase(),
  SOFTWARE: FINDING_CATEGORY_LABELS.SOFTWARE.toLowerCase(),
  KLEARQ: FINDING_CATEGORY_LABELS.KLEARQ.toLowerCase(),
};

export interface StrategyOptions {
  /** Use-case evidence policy. Defaults to the opportunity-driven service pitch. */
  policy?: EvidencePolicy;
  /** Slot of the org's primary offering, used as the storage bucket for intros. */
  primarySlot?: OfferingSlot | null;
  /** The org's names for each area/service, used in the stored explanation. */
  categoryLabels?: Record<string, string>;
  serviceLabels?: Record<string, string>;
}

const DEFAULT_POLICY: EvidencePolicy = {
  citableCategories: [FindingCategory.WEBSITE, FindingCategory.SOFTWARE, FindingCategory.KLEARQ],
  allowClaimFreeIntro: false,
  requireOpportunityEvidence: true,
};

export function selectStrategy(
  score: DraftScoreSummary,
  citableEvidence: EvidenceItem[],
  options: StrategyOptions | EvidencePolicy = {},
): StrategySelection {
  // Accept a bare policy for convenience.
  const opts: StrategyOptions =
    "requireOpportunityEvidence" in options ? { policy: options } : options;
  const policy = opts.policy ?? DEFAULT_POLICY;
  const CATEGORY_LABEL = opts.categoryLabels ?? DEFAULT_CATEGORY_LABEL;
  const SERVICE_LABEL = opts.serviceLabels ?? SERVICE_LABELS;

  const overrideApplied = score.manualOverride && score.effectiveService !== score.computedService;
  const service = score.effectiveService;

  const evidenceFor = (cat: FindingCategory) =>
    citableEvidence.filter((e) => e.category === cat);

  // ---------------------------------------------------------------------
  // Relationship-style outreach (e.g. referrals): the email is not pitched off
  // an "opportunity" found on the recipient's site. It is grounded in verified
  // context about them, and an introduction that claims nothing about them at
  // all is a legitimate outcome rather than a blocked draft.
  // ---------------------------------------------------------------------
  if (!policy.requireOpportunityEvidence) {
    const supporting = sortStrong(
      citableEvidence.filter((e) => policy.citableCategories.includes(e.category)),
    );
    if (supporting.length === 0 && !policy.allowClaimFreeIntro) {
      return insufficient("There is no citable context about this recipient to ground an email.");
    }
    // `service` is only a storage bucket here: the offering being introduced is
    // usually not tied to an opportunity area at all.
    const bucket: RecommendedService =
      (opts.primarySlot as RecommendedService | null | undefined) ??
      (SERVICE_TO_CATEGORY[service] ? service : RecommendedService.WEBSITE);
    return {
      strategy: bucket as OutreachStrategy,
      service: bucket,
      reason:
        supporting.length > 0
          ? `Introduction grounded in ${supporting.length} verified detail(s) about the recipient.`
          : "Introduction that makes no claim about the recipient; there is no verified context to cite.",
      supportingEvidence: supporting,
      overrideApplied: false,
      onlyInference: supporting.length > 0 && supporting.every((e) => !e.isFact),
    };
  }

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
        ? `A manual override selected ${SERVICE_LABEL[service]}, but there is no citable ${CATEGORY_LABEL[cat]} evidence to ground that pitch. An override does not by itself create evidence.`
        : `${SERVICE_LABEL[service]} is recommended, but no citable ${CATEGORY_LABEL[cat]} evidence is available to ground a specific email.`,
    );
  }

  return {
    strategy: service as OutreachStrategy,
    service,
    reason: `${SERVICE_LABEL[service]} is the strongest supported opportunity, grounded in ${supporting.length} observation(s).${overrideNote(overrideApplied)}`,
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
