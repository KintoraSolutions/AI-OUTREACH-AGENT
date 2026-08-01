import { Confidence, FindingCategory, RecommendedService } from "@prisma/client";
import type {
  CategoryBreakdown,
  OverallConfidence,
  RecommendationDetail,
  ScorableFinding,
  ScoreBreakdown,
  ScoreContribution,
  ScoreResult,
  ScoringConfig,
} from "@/lib/scoring/types";

/**
 * Deterministic lead-scoring engine (plan.md Section 6A). Pure: the same findings
 * and config always produce the same score. Every point is traceable to a rule
 * and the finding (evidence) that fired it; subtotals are capped per category and
 * the overall score is clamped to 0-100. Weak evidence cannot fire a rule that
 * requires stronger confidence, and its points are reduced by the confidence
 * multiplier — so an inference never scores like a verified fact.
 */

const CONFIDENCE_RANK: Record<Confidence, number> = {
  UNKNOWN: 0,
  WEAK_INFERENCE: 1,
  STRONG_INFERENCE: 2,
  VERIFIED: 3,
};

const ALL_CATEGORIES: FindingCategory[] = [
  FindingCategory.WEBSITE,
  FindingCategory.SOFTWARE,
  FindingCategory.KLEARQ,
  FindingCategory.CONTACTABILITY,
  FindingCategory.BUSINESS_FIT,
];

const SERVICE_LABEL: Record<RecommendedService, string> = {
  WEBSITE: "Website redesign",
  SOFTWARE: "Custom software",
  KLEARQ: "KlearQ",
  COMBINED: "Combined",
  NONE: "None",
};

const AREA_LABEL: Record<string, string> = {
  WEBSITE: "Website",
  SOFTWARE: "Custom software",
  KLEARQ: "KlearQ",
};

export function scoreClinic(findings: ScorableFinding[], config: ScoringConfig): ScoreResult {
  const ruleById = new Map(config.rules.map((r) => [r.id, r]));
  const byCategory: Record<FindingCategory, ScoreContribution[]> = {
    WEBSITE: [],
    SOFTWARE: [],
    KLEARQ: [],
    CONTACTABILITY: [],
    BUSINESS_FIT: [],
  };
  const rejected: ScoreBreakdown["rejected"] = [];
  const contributionByCode: Record<string, number> = {};

  for (const f of findings) {
    if (f.dismissed) continue;
    const mult = config.confidenceMultipliers[f.confidence] ?? 0;

    if (f.manual) {
      const base = Math.max(0, Math.round(f.manualPoints ?? 0));
      const points = Math.round(base * mult);
      contributionByCode[f.code] = points;
      byCategory[f.category].push({
        ruleId: f.code,
        category: f.category,
        label: "Manual finding",
        basePoints: base,
        confidence: f.confidence,
        confidenceMultiplier: mult,
        points,
        finding: f.finding,
        evidence: f.evidence,
        sourceUrl: f.sourceUrl,
        isFact: f.isFact,
        manual: true,
      });
      continue;
    }

    const rule = ruleById.get(f.code);
    if (!rule) continue; // recorded as evidence, but not part of the scoring model

    // Unsupported-claim rejection: evidence below the rule's minimum confidence
    // contributes nothing (an inference cannot fire a rule that needs a fact).
    if (CONFIDENCE_RANK[f.confidence] < CONFIDENCE_RANK[rule.minConfidence]) {
      contributionByCode[f.code] = 0;
      rejected.push({
        ruleId: rule.id,
        confidence: f.confidence,
        reason: `Requires at least ${rule.minConfidence} confidence.`,
      });
      continue;
    }

    const points = Math.round(rule.points * mult);
    contributionByCode[f.code] = points;
    byCategory[rule.category].push({
      ruleId: rule.id,
      category: rule.category,
      label: rule.label,
      basePoints: rule.points,
      confidence: f.confidence,
      confidenceMultiplier: mult,
      points,
      finding: f.finding,
      evidence: f.evidence,
      sourceUrl: f.sourceUrl,
      isFact: f.isFact,
      manual: false,
    });
  }

  const categories = {} as Record<FindingCategory, CategoryBreakdown>;
  const subtotals = {} as Record<FindingCategory, number>;
  for (const cat of ALL_CATEGORIES) {
    const cap = config.categoryCaps[cat] ?? 0;
    const raw = byCategory[cat].reduce((s, c) => s + c.points, 0);
    const subtotal = Math.max(0, Math.min(cap, raw));
    subtotals[cat] = subtotal;
    categories[cat] = { category: cat, subtotal, cap, contributions: byCategory[cat] };
  }

  const overallScore = Math.max(
    0,
    Math.min(100, ALL_CATEGORIES.reduce((s, c) => s + subtotals[c], 0)),
  );

  const recommendation = recommend(subtotals, config, byCategory);
  const confidence = overallConfidence(byCategory);

  const breakdown: ScoreBreakdown = {
    rulesetVersion: config.version,
    categories,
    recommendation,
    confidence,
    rejected,
  };

  return {
    websiteScore: subtotals.WEBSITE,
    softwareScore: subtotals.SOFTWARE,
    klearqScore: subtotals.KLEARQ,
    contactabilityScore: subtotals.CONTACTABILITY,
    businessFitScore: subtotals.BUSINESS_FIT,
    overallScore,
    recommendedService: recommendation.service,
    recommendationReason: recommendation.reason,
    confidence,
    rulesetVersion: config.version,
    breakdown,
    contributionByCode,
  };
}

function recommend(
  subtotals: Record<FindingCategory, number>,
  config: ScoringConfig,
  byCategory: Record<FindingCategory, ScoreContribution[]>,
): RecommendationDetail {
  const areas = [
    { service: RecommendedService.WEBSITE, cat: FindingCategory.WEBSITE, subtotal: subtotals.WEBSITE },
    { service: RecommendedService.SOFTWARE, cat: FindingCategory.SOFTWARE, subtotal: subtotals.SOFTWARE },
    { service: RecommendedService.KLEARQ, cat: FindingCategory.KLEARQ, subtotal: subtotals.KLEARQ },
  ].sort((a, b) => b.subtotal - a.subtotal);

  const { floor, combinedMargin } = config.recommendation;
  const best = areas[0]!;
  const second = areas[1]!;

  const uncertainties: string[] = [];
  const missingInfo: string[] = [];
  for (const a of areas) {
    if (a.subtotal === 0) {
      missingInfo.push(`No ${AREA_LABEL[a.cat]} opportunity signals were detected.`);
    } else if (byCategory[a.cat].every((c) => !c.isFact)) {
      uncertainties.push(`${AREA_LABEL[a.cat]} opportunity rests only on inferred evidence.`);
    }
  }

  const alternatives = areas
    .slice(1)
    .filter((a) => a.subtotal > 0)
    .map((a) => ({ service: a.service, subtotal: a.subtotal }));

  if (best.subtotal < floor) {
    return {
      service: RecommendedService.NONE,
      reason: `Insufficient evidence: the strongest opportunity (${AREA_LABEL[best.cat]}, ${best.subtotal} pts) is below the ${floor}-point threshold.`,
      alternatives,
      uncertainties: uncertainties.length
        ? uncertainties
        : ["Not enough evidence to recommend a service with confidence."],
      missingInfo,
    };
  }

  // COMBINED requires meaningful evidence for a second area, not merely nonzero:
  // it must also clear the floor and be within the closeness margin.
  const combined = second.subtotal >= floor && best.subtotal - second.subtotal <= combinedMargin;
  if (combined) {
    return {
      service: RecommendedService.COMBINED,
      reason: `${AREA_LABEL[best.cat]} (${best.subtotal} pts) and ${AREA_LABEL[second.cat]} (${second.subtotal} pts) both clear the ${floor}-point threshold and are within ${combinedMargin} points, so a combined pitch is warranted.`,
      alternatives: areas.slice(2).filter((a) => a.subtotal > 0).map((a) => ({ service: a.service, subtotal: a.subtotal })),
      uncertainties,
      missingInfo,
    };
  }

  return {
    service: best.service,
    reason: `${SERVICE_LABEL[best.service]} is the strongest opportunity at ${best.subtotal} points${
      second.subtotal >= floor ? `, ahead of ${AREA_LABEL[second.cat]} (${second.subtotal})` : ""
    }.`,
    alternatives,
    uncertainties,
    missingInfo,
  };
}

function overallConfidence(byCategory: Record<FindingCategory, ScoreContribution[]>): OverallConfidence {
  const all = ALL_CATEGORIES.flatMap((c) => byCategory[c]);
  const total = all.reduce((s, c) => s + c.points, 0);
  if (total === 0) return "LOW";
  const verified = all.filter((c) => c.isFact).reduce((s, c) => s + c.points, 0);
  const share = verified / total;
  if (share >= 0.6) return "HIGH";
  if (share >= 0.3) return "MEDIUM";
  return "LOW";
}
