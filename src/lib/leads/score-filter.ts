import { Prisma, type RecommendedService, type ScoreConfidence } from "@prisma/client";

/**
 * Lead-table score filtering by EFFECTIVE values, i.e. honoring an active manual
 * override. A stored `LeadScore` carries both the computed value and, when an
 * admin has overridden it, an `overrideOverall` / `overrideService`. The lead
 * table shows the effective value, so its filters must match on the effective
 * value too, not the raw computed column.
 *
 * `scoreMatchesEffectiveFilters` is the pure predicate (unit-tested). Confidence
 * is not overridable, so it always matches the stored `confidence`.
 * `buildEffectiveScoreWhere` returns the equivalent Prisma filter for the query,
 * built to agree with the predicate exactly.
 */

export interface EffectiveScoreLike {
  overallScore: number;
  recommendedService: RecommendedService;
  confidence: ScoreConfidence;
  manualOverride: boolean;
  overrideOverall: number | null;
  overrideService: RecommendedService | null;
}

/** The overall a user sees: override when active and set, else the computed score. */
export function effectiveOverallOf(s: EffectiveScoreLike): number {
  return s.manualOverride && s.overrideOverall !== null ? s.overrideOverall : s.overallScore;
}

/** The service a user sees: override when active and set, else the computed one. */
export function effectiveServiceOf(s: EffectiveScoreLike): RecommendedService {
  return s.manualOverride && s.overrideService ? s.overrideService : s.recommendedService;
}

export interface ScoreFilter {
  minScore?: number | null;
  maxScore?: number | null;
  service?: RecommendedService | null;
  confidence?: ScoreConfidence | null;
}

/** True when a stored score matches the filters using its effective values. */
export function scoreMatchesEffectiveFilters(s: EffectiveScoreLike, f: ScoreFilter): boolean {
  const overall = effectiveOverallOf(s);
  if (f.minScore != null && overall < f.minScore) return false;
  if (f.maxScore != null && overall > f.maxScore) return false;
  if (f.service && effectiveServiceOf(s) !== f.service) return false;
  if (f.confidence && s.confidence !== f.confidence) return false;
  return true;
}

/**
 * Prisma `LeadScoreWhereInput` equivalent to `scoreMatchesEffectiveFilters`.
 * Returns null when no score-based filter is active. For the overridable columns
 * it matches either (a) the override when one is active and set, or (b) the
 * computed column when no effective override exists for that field.
 */
export function buildEffectiveScoreWhere(f: ScoreFilter): Prisma.LeadScoreWhereInput | null {
  const and: Prisma.LeadScoreWhereInput[] = [];

  const range: Prisma.IntFilter = {};
  if (f.minScore != null) range.gte = f.minScore;
  if (f.maxScore != null) range.lte = f.maxScore;
  if (range.gte !== undefined || range.lte !== undefined) {
    and.push({
      OR: [
        // Override active and in range.
        { manualOverride: true, overrideOverall: range },
        // No effective overall override: match the computed score.
        {
          AND: [
            { OR: [{ manualOverride: false }, { overrideOverall: null }] },
            { overallScore: range },
          ],
        },
      ],
    });
  }

  if (f.service) {
    and.push({
      OR: [
        { manualOverride: true, overrideService: f.service },
        {
          AND: [
            { OR: [{ manualOverride: false }, { overrideService: null }] },
            { recommendedService: f.service },
          ],
        },
      ],
    });
  }

  if (f.confidence) and.push({ confidence: f.confidence });

  if (and.length === 0) return null;
  return { AND: and };
}
