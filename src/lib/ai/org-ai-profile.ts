import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPreset, DEFAULT_PRESET_KEY } from "@/lib/ai/presets";
import { DEFAULT_USE_CASE_KEY, USE_CASE_VALUES, type OutreachUseCase, type UseCaseKey } from "@/lib/ai/use-cases";
import type { IndustryPreset } from "@/lib/ai/presets/types";

/**
 * The organization's own AI configuration: what it sells, who it talks to, the
 * words it uses, and the extra rules it wants followed. Stored as an org-scoped
 * `SystemSetting` row (key `ai.profile`), the same pattern as `scoring.weights`,
 * `email.voice`, and `company.profile` — so no schema migration is needed.
 *
 * This replaces the product-specific configuration the app used to hardcode. No
 * product name lives in code any more: the three `OFFERING_SLOTS` below are
 * anonymous internal buckets that line up with the existing database enums, and
 * every user-visible name comes from the org's own `offerings`.
 *
 * SAFETY: `customGuardrails` can only ADD restrictions. Preset and use-case
 * guardrails are never stored here and therefore can never be edited away by a
 * user — see `effectiveGuardrails`. Everything in this profile is org-authored
 * DATA that is injected as subordinate guidance; it can never override the fixed
 * safety contract in `DRAFT_SYSTEM_PROMPT` or relax the evidence rules.
 */

export const ORG_AI_PROFILE_SETTING_KEY = "ai.profile";

export const INDUSTRY_VALUES = ["healthcare", "general"] as const;
export type IndustryKey = (typeof INDUSTRY_VALUES)[number];

/**
 * The three pitchable buckets that already exist in the database as
 * `RecommendedService` / `FindingCategory` members. These identifiers are
 * INTERNAL ONLY and carry no product meaning; the org's offering supplies the
 * display name. Renaming them would require a migration, which is deliberately
 * out of scope.
 */
export const OFFERING_SLOTS = ["WEBSITE", "SOFTWARE", "KLEARQ"] as const;
export type OfferingSlot = (typeof OFFERING_SLOTS)[number];

/**
 * Neutral names for the internal slots. These describe the RECIPIENT's
 * opportunity areas that the scoring engine measures, so they are what the leads
 * UI falls back to when the org has not bound an offering to that slot.
 */
export const DEFAULT_SLOT_LABELS: Record<OfferingSlot, { name: string; shortLabel: string }> = {
  WEBSITE: { name: "Website", shortLabel: "WEB" },
  SOFTWARE: { name: "Custom software", shortLabel: "SW" },
  KLEARQ: { name: "Phone operations", shortLabel: "PHONE" },
};

export interface Offering {
  /** Stable slug, unique within the org. */
  key: string;
  /**
   * The opportunity area this offering addresses, or null when it is not tied
   * to one. Referral outreach is the null case: a clinical service is not a
   * "website opportunity", and binding it to a slot would mislabel the scoring
   * categories in the leads UI.
   */
  slot: OfferingSlot | null;
  /** Display name, e.g. "Website redesign" or "Physiotherapy". */
  name: string;
  /** Compact label for dense UI (tables, radar axes). */
  shortLabel: string;
  description: string | null;
  /** How the model should pitch this, in the org's own words. */
  pitchGuidance: string | null;
  /** Supporting link for this offering (generalizes the old portfolio URL). */
  proofUrl: string | null;
  enabled: boolean;
}

export interface LearnedNotes {
  /** Distilled from user feedback. Reserved for the feedback-loop phase. */
  styleNotes: string | null;
  updatedAt: string | null;
  feedbackCount: number;
}

export interface OrgAiProfile {
  revision: number;
  industry: IndustryKey;
  presetKey: string;
  useCase: UseCaseKey;
  offerings: Offering[];
  /** Which offering leads when the use case is not driven by opportunity areas. */
  primaryOfferingKey: string | null;
  terminology: string[];
  avoidTerms: string[];
  /** Org-authored additional restrictions. Additive only. */
  customGuardrails: string[];
  audienceNote: string | null;
  learned: LearnedNotes;
  /** Set once the user has reviewed the inferred configuration. */
  confirmedAt: string | null;
  inferred: { at: string | null; model: string | null };
}

// ---------------------------------------------------------------------------
// Parsing helpers (same idiom as company-profile.ts / email-voice.ts)
// ---------------------------------------------------------------------------

const text = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t.slice(0, max) : null;
  }, z.string().nullable());

const lines = (max: number, maxCount: number) =>
  z.preprocess(
    (v) => {
      const arr = typeof v === "string" ? v.split("\n") : Array.isArray(v) ? v : [];
      return arr
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, maxCount)
        .map((s) => s.slice(0, max));
    },
    z.array(z.string()).default([]),
  );

/** Accepts a stored boolean or an HTML checkbox value. */
const boolish = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

/** Unknown/missing slots degrade to null rather than throwing. */
const slotSchema = z.preprocess(
  (v) => (typeof v === "string" && (OFFERING_SLOTS as readonly string[]).includes(v) ? v : null),
  z.enum(OFFERING_SLOTS).nullable(),
);

const offeringSchema = z.object({
  key: z.string().trim().max(60).catch(""),
  slot: slotSchema,
  name: z.string().trim().max(80).catch(""),
  shortLabel: z.string().trim().max(12).catch(""),
  description: text(300),
  pitchGuidance: text(600),
  proofUrl: text(300),
  enabled: boolish,
});

export const MAX_OFFERINGS = 8;

/** Stable slug from a name, for offering keys. */
export function slugifyOfferingKey(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || `offering-${index + 1}`;
}

export const orgAiProfileSchema = z.object({
  revision: z.number().int().min(0).catch(0),
  industry: z.enum(INDUSTRY_VALUES).catch("general"),
  presetKey: z.string().trim().max(60).catch(DEFAULT_PRESET_KEY),
  useCase: z.enum(USE_CASE_VALUES).catch(DEFAULT_USE_CASE_KEY),
  offerings: z.array(offeringSchema).max(MAX_OFFERINGS).catch([]),
  primaryOfferingKey: text(60),
  terminology: lines(60, 30),
  avoidTerms: lines(60, 30),
  customGuardrails: lines(300, 20),
  audienceNote: text(600),
  learned: z
    .object({
      styleNotes: text(2000),
      updatedAt: text(40),
      feedbackCount: z.number().int().min(0).catch(0),
    })
    .catch({ styleNotes: null, updatedAt: null, feedbackCount: 0 }),
  confirmedAt: text(40),
  inferred: z
    .object({ at: text(40), model: text(80) })
    .catch({ at: null, model: null }),
});

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const EMPTY_LEARNED: LearnedNotes = { styleNotes: null, updatedAt: null, feedbackCount: 0 };

/**
 * Make an offering list safe to use: fill blank names/keys, de-duplicate keys,
 * cap the count, and keep at most one ENABLED offering per slot so slot label
 * resolution and strategy selection stay deterministic.
 */
export function normalizeOfferings(candidates: Partial<Offering>[] | undefined | null): Offering[] {
  const seenKeys = new Set<string>();
  const usedSlots = new Set<OfferingSlot>();
  const out: Offering[] = [];

  for (const [i, raw] of (candidates ?? []).slice(0, MAX_OFFERINGS).entries()) {
    if (!raw) continue;
    const name = (raw.name ?? "").trim();
    const slot = raw.slot ?? null;
    if (!name && !raw.description && !raw.pitchGuidance) continue;

    let key = (raw.key ?? "").trim() || slugifyOfferingKey(name, i);
    while (seenKeys.has(key)) key = `${key}-${seenKeys.size + 1}`;
    seenKeys.add(key);

    // Only the first enabled offering may own a slot.
    let enabled = raw.enabled ?? true;
    if (slot && enabled) {
      if (usedSlots.has(slot)) enabled = false;
      else usedSlots.add(slot);
    }

    out.push({
      key,
      slot,
      name: name || key,
      shortLabel: (raw.shortLabel ?? "").trim() || (slot ? DEFAULT_SLOT_LABELS[slot].shortLabel : name.slice(0, 6).toUpperCase()),
      description: raw.description ?? null,
      pitchGuidance: raw.pitchGuidance ?? null,
      proofUrl: raw.proofUrl ?? null,
      enabled,
    });
  }
  return out;
}

const nonEmpty = <T>(arr: T[] | undefined | null): arr is T[] => Array.isArray(arr) && arr.length > 0;

/**
 * Compose a complete profile from the layers, later winning over earlier:
 *   preset  ←  inferred (from onboarding)  ←  stored (the org's own edits)
 *
 * Pure, so it is unit-testable without a database. Mirrors `resolveScoringConfig`.
 *
 * Note that a stored profile row is always written COMPLETE, so loading does not
 * depend on subtle merge semantics; this composer is for building a profile in
 * the first place (onboarding, legacy backfill, tests).
 */
export function resolveOrgAiProfile(input: {
  preset: IndustryPreset;
  inferred?: Partial<OrgAiProfile> | null;
  stored?: Partial<OrgAiProfile> | null;
}): OrgAiProfile {
  const { preset, inferred, stored } = input;

  // Offerings replace wholesale: take the highest layer that supplies any.
  const rawOfferings = nonEmpty(stored?.offerings)
    ? stored.offerings
    : nonEmpty(inferred?.offerings)
      ? inferred.offerings
      : preset.offerings;
  const offerings = normalizeOfferings(rawOfferings);

  const primaryKey =
    stored?.primaryOfferingKey ?? inferred?.primaryOfferingKey ?? preset.primaryOfferingKey ?? null;

  const storedTerms = stored?.terminology;
  const inferredTerms = inferred?.terminology;
  const storedAvoid = stored?.avoidTerms;
  const inferredAvoid = inferred?.avoidTerms;

  return {
    revision: stored?.revision ?? 0,
    industry: stored?.industry ?? inferred?.industry ?? preset.industry,
    presetKey: stored?.presetKey ?? inferred?.presetKey ?? preset.key,
    useCase: stored?.useCase ?? inferred?.useCase ?? preset.defaultUseCase,
    offerings,
    primaryOfferingKey: offerings.some((o) => o.key === primaryKey) ? primaryKey : (offerings.find((o) => o.enabled)?.key ?? null),
    terminology: nonEmpty(storedTerms)
      ? storedTerms
      : nonEmpty(inferredTerms)
        ? inferredTerms
        : preset.terminology,
    avoidTerms: nonEmpty(storedAvoid)
      ? storedAvoid
      : nonEmpty(inferredAvoid)
        ? inferredAvoid
        : preset.avoidTerms,
    // Preset + use-case guardrails are intentionally NOT merged in here; they
    // are applied at prompt time so they cannot be edited away. See
    // `effectiveGuardrails`.
    customGuardrails: stored?.customGuardrails ?? inferred?.customGuardrails ?? [],
    audienceNote: stored?.audienceNote ?? inferred?.audienceNote ?? null,
    learned: stored?.learned ?? EMPTY_LEARNED,
    confirmedAt: stored?.confirmedAt ?? null,
    inferred: stored?.inferred ?? inferred?.inferred ?? { at: null, model: null },
  };
}

/**
 * Every restriction that applies to a draft, in precedence-free union form:
 * preset guardrails + use-case guardrails + the org's own. Additive by
 * construction — an org can add rules but can never remove a preset's.
 */
export function effectiveGuardrails(profile: OrgAiProfile, useCase: OutreachUseCase): string[] {
  const preset = getPreset(profile.presetKey);
  const all = [...preset.guardrails, ...useCase.guardrails, ...profile.customGuardrails];
  return [...new Set(all.map((g) => g.trim()).filter(Boolean))];
}

/** The enabled offering bound to a slot, if the org configured one. */
export function offeringForSlot(profile: OrgAiProfile, slot: OfferingSlot): Offering | null {
  return profile.offerings.find((o) => o.slot === slot && o.enabled) ?? null;
}

/** The offering a referral/introduction leads with. */
export function primaryOffering(profile: OrgAiProfile): Offering | null {
  const byKey = profile.offerings.find((o) => o.key === profile.primaryOfferingKey && o.enabled);
  return byKey ?? profile.offerings.find((o) => o.enabled) ?? null;
}

/**
 * The org's name for a slot, falling back to the neutral area name. Slots
 * describe the RECIPIENT's opportunity areas, so an org that has not bound an
 * offering to a slot still gets a sensible, product-free label.
 */
export function slotName(profile: OrgAiProfile, slot: OfferingSlot): string {
  return offeringForSlot(profile, slot)?.name || DEFAULT_SLOT_LABELS[slot].name;
}

export function slotShortLabel(profile: OrgAiProfile, slot: OfferingSlot): string {
  return offeringForSlot(profile, slot)?.shortLabel || DEFAULT_SLOT_LABELS[slot].shortLabel;
}

// ---------------------------------------------------------------------------
// Legacy backfill + loading
// ---------------------------------------------------------------------------

/** Organization columns the pre-profile configuration used. */
export interface LegacyOrgConfig {
  klearqProductName: string | null;
  klearqTagline: string | null;
  portfolioUrl: string | null;
}

/**
 * Seed offerings from the org columns the app used before profiles existed, so
 * an organization that configured a product keeps working unchanged. The columns
 * stay in the database but are read nowhere else.
 */
export function buildLegacyOfferings(
  legacy: LegacyOrgConfig,
  preset: IndustryPreset,
): Offering[] {
  return preset.offerings.map((o) => {
    if (o.slot === "WEBSITE" && legacy.portfolioUrl) {
      return { ...o, proofUrl: legacy.portfolioUrl };
    }
    if (o.slot === "KLEARQ" && legacy.klearqProductName) {
      return {
        ...o,
        name: legacy.klearqProductName,
        shortLabel: legacy.klearqProductName.slice(0, 6).toUpperCase(),
        description: legacy.klearqTagline ?? o.description,
      };
    }
    return o;
  });
}

/**
 * Read an org's AI profile. Falls back to the preset (plus any legacy product
 * columns) when nothing has been saved yet, so drafting always has a complete,
 * usable configuration. Never throws.
 */
export async function loadOrgAiProfile(orgId: string): Promise<OrgAiProfile> {
  const [row, org] = await Promise.all([
    prisma.systemSetting.findUnique({
      where: { orgId_key: { orgId, key: ORG_AI_PROFILE_SETTING_KEY } },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { klearqProductName: true, klearqTagline: true, portfolioUrl: true },
    }),
  ]);

  const parsed = row ? orgAiProfileSchema.safeParse(row.value) : null;
  const stored = parsed?.success ? (parsed.data as Partial<OrgAiProfile>) : null;
  const preset = getPreset(stored?.presetKey);

  if (!stored) {
    // No saved profile: start from the preset, carrying over legacy columns.
    const withLegacy: IndustryPreset = org
      ? { ...preset, offerings: buildLegacyOfferings(org, preset) }
      : preset;
    return resolveOrgAiProfile({ preset: withLegacy });
  }

  return resolveOrgAiProfile({ preset, stored });
}
