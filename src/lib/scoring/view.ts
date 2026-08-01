import { FindingCategory, type RecommendedService, type ScoreConfidence } from "@prisma/client";
import type { ScoreBreakdown } from "@/lib/scoring/types";

/**
 * Client-safe helpers for presenting a stored score. The "effective" values
 * apply an active manual override on top of the computed score, without losing
 * the computed value (both are shown in the UI).
 */

export const SCORE_CATEGORY_ORDER: FindingCategory[] = [
  FindingCategory.WEBSITE,
  FindingCategory.SOFTWARE,
  FindingCategory.KLEARQ,
  FindingCategory.CONTACTABILITY,
  FindingCategory.BUSINESS_FIT,
];

export interface ScoreView {
  websiteScore: number;
  softwareScore: number;
  klearqScore: number;
  contactabilityScore: number;
  businessFitScore: number;
  overallScore: number;
  recommendedService: RecommendedService;
  recommendationReason: string | null;
  confidence: ScoreConfidence;
  weightsVersion: string;
  computedAt: string;
  manualOverride: boolean;
  overrideOverall: number | null;
  overrideService: RecommendedService | null;
  overrideReason: string | null;
  breakdown: ScoreBreakdown;
}

export function effectiveOverall(s: {
  manualOverride: boolean;
  overrideOverall: number | null;
  overallScore: number;
}): number {
  return s.manualOverride && s.overrideOverall !== null ? s.overrideOverall : s.overallScore;
}

export function effectiveService(s: {
  manualOverride: boolean;
  overrideService: RecommendedService | null;
  recommendedService: RecommendedService;
}): RecommendedService {
  return s.manualOverride && s.overrideService ? s.overrideService : s.recommendedService;
}

export function categorySubtotal(view: ScoreView, category: FindingCategory): number {
  switch (category) {
    case FindingCategory.WEBSITE:
      return view.websiteScore;
    case FindingCategory.SOFTWARE:
      return view.softwareScore;
    case FindingCategory.KLEARQ:
      return view.klearqScore;
    case FindingCategory.CONTACTABILITY:
      return view.contactabilityScore;
    case FindingCategory.BUSINESS_FIT:
      return view.businessFitScore;
  }
}
