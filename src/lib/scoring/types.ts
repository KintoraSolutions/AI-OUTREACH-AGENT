import type { Confidence, FindingCategory, RecommendedService } from "@prisma/client";

/**
 * Contracts for the deterministic lead-scoring engine (plan.md Section 6A).
 * Everything here is pure and provider-agnostic: the engine turns audit findings
 * (evidence) plus an org's scoring configuration into an explainable 0-100 score
 * and a service recommendation. No Prisma, no I/O.
 */

/** The five scoring categories map 1:1 onto `FindingCategory`. */
export type ScoringCategory = FindingCategory;

/** A finding as consumed by the scorer (from a fresh audit or the database). */
export interface ScorableFinding {
  code: string;
  category: FindingCategory;
  confidence: Confidence;
  finding: string;
  evidence: string;
  sourceUrl: string;
  isFact: boolean;
  manual: boolean;
  /** Base points for a manual finding; auto findings get points from the ruleset. */
  manualPoints?: number | null;
  dismissed?: boolean;
}

/** One rule in the default/effective ruleset. */
export interface ScoringRule {
  id: string;
  category: FindingCategory;
  points: number;
  label: string;
  description: string;
  /** The rule contributes only when the finding's confidence is at least this. */
  minConfidence: Confidence;
}

export interface ScoringConfig {
  version: string;
  /** Per-rule point overrides (ruleId -> points). Missing rules use the default. */
  ruleWeights: Record<string, number>;
  categoryCaps: Record<FindingCategory, number>;
  confidenceMultipliers: Record<Confidence, number>;
  recommendation: {
    /** An area must reach this subtotal to be recommended at all. */
    floor: number;
    /** Two areas within this many points (and both >= floor) => COMBINED. */
    combinedMargin: number;
  };
  rules: ScoringRule[];
}

/** One rule's contribution to the score, with the evidence behind it. */
export interface ScoreContribution {
  ruleId: string;
  category: FindingCategory;
  label: string;
  basePoints: number;
  confidence: Confidence;
  confidenceMultiplier: number;
  points: number;
  finding: string;
  evidence: string;
  sourceUrl: string;
  isFact: boolean;
  manual: boolean;
}

export interface CategoryBreakdown {
  category: FindingCategory;
  subtotal: number;
  cap: number;
  contributions: ScoreContribution[];
}

export type OverallConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface RecommendationDetail {
  service: RecommendedService;
  reason: string;
  alternatives: { service: RecommendedService; subtotal: number }[];
  uncertainties: string[];
  missingInfo: string[];
}

/** The full, JSON-serializable score breakdown stored on `LeadScore.breakdown`. */
export interface ScoreBreakdown {
  rulesetVersion: string;
  categories: Record<FindingCategory, CategoryBreakdown>;
  recommendation: RecommendationDetail;
  confidence: OverallConfidence;
  /** Points ignored because the evidence was below a rule's minimum confidence. */
  rejected: { ruleId: string; confidence: Confidence; reason: string }[];
}

export interface ScoreResult {
  websiteScore: number;
  softwareScore: number;
  klearqScore: number;
  contactabilityScore: number;
  businessFitScore: number;
  overallScore: number;
  recommendedService: RecommendedService;
  recommendationReason: string;
  confidence: OverallConfidence;
  rulesetVersion: string;
  breakdown: ScoreBreakdown;
  /** ruleId/finding-code -> points awarded, for stamping each finding. */
  contributionByCode: Record<string, number>;
}
