import { z } from "zod";
import { Confidence, FindingCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_RULESET_VERSION,
  defaultScoringConfig,
} from "@/lib/scoring/rules";
import type { ScoringConfig } from "@/lib/scoring/types";

/**
 * Effective scoring configuration = documented defaults (rules.ts) overlaid with
 * an org's stored overrides (`SystemSetting` key `scoring.weights`). Admins can
 * adjust rule weights, category caps, confidence multipliers, and recommendation
 * thresholds. `resolveScoringConfig` is pure (used in tests without a DB);
 * `loadScoringConfig` reads the org's stored overrides.
 */

export const SCORING_SETTING_KEY = "scoring.weights";

export const scoringOverridesSchema = z.object({
  // Monotonic revision, bumped on each save, so a stored config maps to a stable
  // ruleset version and re-scoring is deterministic.
  revision: z.number().int().min(0).default(0),
  ruleWeights: z.record(z.string(), z.number().int().min(0).max(50)).default({}),
  categoryCaps: z
    .object({
      WEBSITE: z.number().int().min(0).max(100).optional(),
      SOFTWARE: z.number().int().min(0).max(100).optional(),
      KLEARQ: z.number().int().min(0).max(100).optional(),
      CONTACTABILITY: z.number().int().min(0).max(100).optional(),
      BUSINESS_FIT: z.number().int().min(0).max(100).optional(),
    })
    .default({}),
  confidenceMultipliers: z
    .object({
      VERIFIED: z.number().min(0).max(1).optional(),
      STRONG_INFERENCE: z.number().min(0).max(1).optional(),
      WEAK_INFERENCE: z.number().min(0).max(1).optional(),
      UNKNOWN: z.number().min(0).max(1).optional(),
    })
    .default({}),
  recommendation: z
    .object({
      floor: z.number().int().min(0).max(100).optional(),
      combinedMargin: z.number().int().min(0).max(50).optional(),
    })
    .default({}),
});

export type ScoringOverrides = z.infer<typeof scoringOverridesSchema>;

/** Merge stored overrides onto the documented defaults. Pure. */
export function resolveScoringConfig(overrides: ScoringOverrides | null): ScoringConfig {
  const base = defaultScoringConfig();
  if (!overrides || overrides.revision === 0) return base;

  const categoryCaps = { ...base.categoryCaps };
  for (const key of Object.keys(base.categoryCaps) as FindingCategory[]) {
    const v = overrides.categoryCaps[key];
    if (typeof v === "number") categoryCaps[key] = v;
  }

  const confidenceMultipliers = { ...base.confidenceMultipliers };
  for (const key of Object.keys(base.confidenceMultipliers) as Confidence[]) {
    const v = overrides.confidenceMultipliers[key];
    if (typeof v === "number") confidenceMultipliers[key] = v;
  }

  return {
    version: `custom-r${overrides.revision}`,
    ruleWeights: { ...overrides.ruleWeights },
    categoryCaps,
    confidenceMultipliers,
    recommendation: {
      floor: overrides.recommendation.floor ?? base.recommendation.floor,
      combinedMargin: overrides.recommendation.combinedMargin ?? base.recommendation.combinedMargin,
    },
    // Rule definitions themselves are fixed; only their point weights are tunable.
    rules: base.rules.map((r) => ({
      ...r,
      points: overrides.ruleWeights[r.id] ?? r.points,
    })),
  };
}

/** Read an org's effective scoring config from stored settings. */
export async function loadScoringConfig(orgId: string): Promise<ScoringConfig> {
  const row = await prisma.systemSetting.findUnique({
    where: { orgId_key: { orgId, key: SCORING_SETTING_KEY } },
  });
  if (!row) return defaultScoringConfig();
  const parsed = scoringOverridesSchema.safeParse(row.value);
  if (!parsed.success) return defaultScoringConfig();
  return resolveScoringConfig(parsed.data);
}

/** Load the raw stored overrides (for the settings editor), or defaults. */
export async function loadScoringOverrides(orgId: string): Promise<ScoringOverrides> {
  const row = await prisma.systemSetting.findUnique({
    where: { orgId_key: { orgId, key: SCORING_SETTING_KEY } },
  });
  const parsed = scoringOverridesSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : scoringOverridesSchema.parse({});
}

/**
 * Load the effective config AND the raw overrides in a SINGLE DB read. The
 * settings page needs both, and they derive from the same stored row — calling
 * `loadScoringConfig` + `loadScoringOverrides` separately queried it twice.
 * Semantics are identical to calling both individually.
 */
export async function loadScoringConfigAndOverrides(
  orgId: string,
): Promise<{ config: ScoringConfig; overrides: ScoringOverrides }> {
  const row = await prisma.systemSetting.findUnique({
    where: { orgId_key: { orgId, key: SCORING_SETTING_KEY } },
  });
  const parsed = scoringOverridesSchema.safeParse(row?.value ?? {});
  const overrides = parsed.success ? parsed.data : scoringOverridesSchema.parse({});
  const config = parsed.success ? resolveScoringConfig(parsed.data) : defaultScoringConfig();
  return { config, overrides };
}

export { DEFAULT_RULESET_VERSION };
