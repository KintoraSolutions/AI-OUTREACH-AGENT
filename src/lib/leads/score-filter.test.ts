import { describe, expect, it } from "vitest";
import { RecommendedService, ScoreConfidence } from "@prisma/client";
import {
  buildEffectiveScoreWhere,
  effectiveOverallOf,
  effectiveServiceOf,
  scoreMatchesEffectiveFilters,
  type EffectiveScoreLike,
} from "@/lib/leads/score-filter";

function score(partial: Partial<EffectiveScoreLike>): EffectiveScoreLike {
  return {
    overallScore: 40,
    recommendedService: RecommendedService.WEBSITE,
    confidence: ScoreConfidence.MEDIUM,
    manualOverride: false,
    overrideOverall: null,
    overrideService: null,
    ...partial,
  };
}

describe("effective value helpers", () => {
  it("uses the computed value when there is no override", () => {
    const s = score({ overallScore: 55, recommendedService: RecommendedService.SOFTWARE });
    expect(effectiveOverallOf(s)).toBe(55);
    expect(effectiveServiceOf(s)).toBe(RecommendedService.SOFTWARE);
  });

  it("uses the override when active and set", () => {
    const s = score({
      overallScore: 55,
      recommendedService: RecommendedService.SOFTWARE,
      manualOverride: true,
      overrideOverall: 90,
      overrideService: RecommendedService.KLEARQ,
    });
    expect(effectiveOverallOf(s)).toBe(90);
    expect(effectiveServiceOf(s)).toBe(RecommendedService.KLEARQ);
  });

  it("falls back to the computed field when the override leaves it null", () => {
    // Service-only override: effective overall is still the computed score.
    const s = score({
      overallScore: 55,
      manualOverride: true,
      overrideOverall: null,
      overrideService: RecommendedService.KLEARQ,
    });
    expect(effectiveOverallOf(s)).toBe(55);
    expect(effectiveServiceOf(s)).toBe(RecommendedService.KLEARQ);
  });
});

describe("scoreMatchesEffectiveFilters", () => {
  it("filters an overridden score by its effective overall, not the computed one", () => {
    const s = score({ overallScore: 20, manualOverride: true, overrideOverall: 85 });
    // Computed is 20; a 80-100 filter should match because effective is 85.
    expect(scoreMatchesEffectiveFilters(s, { minScore: 80, maxScore: 100 })).toBe(true);
    // A 0-30 filter must NOT match, even though the computed value is 20.
    expect(scoreMatchesEffectiveFilters(s, { minScore: 0, maxScore: 30 })).toBe(false);
  });

  it("filters an overridden score by its effective service", () => {
    const s = score({
      recommendedService: RecommendedService.WEBSITE,
      manualOverride: true,
      overrideService: RecommendedService.KLEARQ,
    });
    expect(scoreMatchesEffectiveFilters(s, { service: RecommendedService.KLEARQ })).toBe(true);
    expect(scoreMatchesEffectiveFilters(s, { service: RecommendedService.WEBSITE })).toBe(false);
  });

  it("matches confidence directly (confidence is not overridable)", () => {
    const s = score({ confidence: ScoreConfidence.HIGH });
    expect(scoreMatchesEffectiveFilters(s, { confidence: ScoreConfidence.HIGH })).toBe(true);
    expect(scoreMatchesEffectiveFilters(s, { confidence: ScoreConfidence.LOW })).toBe(false);
  });

  it("combines range, service, and confidence (all must hold)", () => {
    const s = score({
      overallScore: 70,
      recommendedService: RecommendedService.SOFTWARE,
      confidence: ScoreConfidence.HIGH,
    });
    expect(
      scoreMatchesEffectiveFilters(s, {
        minScore: 60,
        service: RecommendedService.SOFTWARE,
        confidence: ScoreConfidence.HIGH,
      }),
    ).toBe(true);
    expect(
      scoreMatchesEffectiveFilters(s, {
        minScore: 60,
        service: RecommendedService.SOFTWARE,
        confidence: ScoreConfidence.LOW,
      }),
    ).toBe(false);
  });
});

describe("buildEffectiveScoreWhere", () => {
  it("returns null when no score filter is active", () => {
    expect(buildEffectiveScoreWhere({})).toBeNull();
  });

  it("builds an OR that considers the override for the overall range", () => {
    const where = buildEffectiveScoreWhere({ minScore: 80, maxScore: 100 });
    expect(where).not.toBeNull();
    // The AND wraps one clause per active filter; the range clause is an OR of
    // (override active + in range) or (no override + computed in range).
    const clause = where!.AND as { OR?: unknown[] }[];
    expect(Array.isArray(clause)).toBe(true);
    expect(clause[0]!.OR).toHaveLength(2);
  });

  it("includes a service clause and a confidence clause when provided", () => {
    const where = buildEffectiveScoreWhere({
      service: RecommendedService.KLEARQ,
      confidence: ScoreConfidence.HIGH,
    });
    const clauses = where!.AND as Record<string, unknown>[];
    expect(clauses).toHaveLength(2);
    // The confidence clause is a direct match (not overridable).
    expect(clauses.some((c) => c.confidence === ScoreConfidence.HIGH)).toBe(true);
  });
});
