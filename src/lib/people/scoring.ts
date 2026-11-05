import { Confidence } from "@prisma/client";
import { DEFAULT_CONFIDENCE_MULTIPLIERS } from "@/lib/scoring/rules";

/**
 * Scoring a decision-maker.
 *
 * Deliberately a separate engine from `scoreClinic`, not a generalisation of
 * it. Three reasons, in order of weight:
 *
 * 1. The two scores answer different questions. A clinic's score measures
 *    opportunity — how much is wrong with their public setup. A person's score
 *    measures influence and reachability. Summing them would be meaningless,
 *    and sharing one engine invites exactly that.
 * 2. `scoreClinic` is pure, heavily tested, and run live by the public
 *    marketing page to print a worked example. Widening it to carry a second
 *    set of categories and caps is a change to the most load-bearing function
 *    in the codebase for no gain.
 * 3. `FindingCategory` keys the clinic engine's category maps. Adding a person
 *    category there would pull person evidence into clinic scoring.
 *
 * What IS shared is the machinery that should not be reinvented: the same
 * confidence multipliers, the same "points scale with how well the evidence is
 * supported" rule, the same refusal to let evidence below a rule's minimum
 * contribute anything, and the same per-category caps and stored breakdown.
 */

/** Person scoring areas. A plain union, not a Prisma enum: see note 3 above. */
export type PersonCategory = "AUTHORITY" | "REACH" | "CONTACTABILITY";

export interface PersonRule {
  id: string;
  category: PersonCategory;
  points: number;
  label: string;
  description: string;
  /** The rule contributes only when the evidence is at least this confident. */
  minConfidence: Confidence;
}

export const DEFAULT_PERSON_RULESET_VERSION = "person-default-v1";

const C = Confidence;

/**
 * Point values are defaults an org admin can override, exactly as the clinic
 * rules are. Authority dominates on purpose: reaching a practice manager who
 * can sign is worth more than reaching three associates who cannot.
 */
export const DEFAULT_PERSON_RULES: PersonRule[] = [
  {
    id: "person_role_owner",
    category: "AUTHORITY",
    points: 50,
    label: "Stated owner or founder",
    description: "The clinic names this person as an owner, founder or principal.",
    minConfidence: C.VERIFIED,
  },
  {
    id: "person_role_medical_director",
    category: "AUTHORITY",
    points: 40,
    label: "Stated medical director",
    description: "The clinic names this person as its medical or clinical director.",
    minConfidence: C.VERIFIED,
  },
  {
    id: "person_role_admin_leader",
    category: "AUTHORITY",
    points: 28,
    label: "Practice leadership",
    description: "A practice, clinic or operations manager, who often holds the purchasing decision.",
    minConfidence: C.STRONG_INFERENCE,
  },
  {
    id: "person_role_lead_physician",
    category: "AUTHORITY",
    points: 25,
    label: "Lead or senior physician",
    description: "Leadership language implying authority without stating a formal role.",
    minConfidence: C.STRONG_INFERENCE,
  },
  {
    id: "person_role_physician",
    category: "AUTHORITY",
    points: 8,
    label: "Listed physician",
    description: "Named on the team page with no stated authority. Being listed is not authority.",
    minConfidence: C.WEAK_INFERENCE,
  },
  {
    id: "person_multi_clinic",
    category: "REACH",
    points: 30,
    label: "Affiliated with multiple clinics",
    description: "Appears on the public sites of more than one clinic in the pipeline.",
    minConfidence: C.STRONG_INFERENCE,
  },
  {
    id: "person_direct_email",
    category: "CONTACTABILITY",
    points: 20,
    label: "Direct professional address",
    description: "The clinic publishes an address for this person. Never inferred from a name.",
    minConfidence: C.VERIFIED,
  },
];

export const DEFAULT_PERSON_CATEGORY_CAPS: Record<PersonCategory, number> = {
  AUTHORITY: 50,
  REACH: 30,
  CONTACTABILITY: 20,
};

export interface PersonScoringConfig {
  version: string;
  ruleWeights: Record<string, number>;
  categoryCaps: Record<PersonCategory, number>;
  confidenceMultipliers: Record<Confidence, number>;
  rules: PersonRule[];
}

export function defaultPersonScoringConfig(): PersonScoringConfig {
  return {
    version: DEFAULT_PERSON_RULESET_VERSION,
    ruleWeights: {},
    categoryCaps: { ...DEFAULT_PERSON_CATEGORY_CAPS },
    confidenceMultipliers: { ...DEFAULT_CONFIDENCE_MULTIPLIERS },
    rules: DEFAULT_PERSON_RULES,
  };
}

/** A finding in the shape the engine scores. Mirrors `ScorableFinding`. */
export interface ScorablePersonFinding {
  code: string;
  confidence: Confidence;
  isFact: boolean;
  dismissed?: boolean;
}

export interface PersonContribution {
  ruleId: string;
  category: PersonCategory;
  label: string;
  basePoints: number;
  confidence: Confidence;
  confidenceMultiplier: number;
  points: number;
}

export interface PersonScoreResult {
  authorityScore: number;
  reachScore: number;
  contactabilityScore: number;
  overallScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rulesetVersion: string;
  breakdown: {
    rulesetVersion: string;
    categories: Record<
      PersonCategory,
      { category: PersonCategory; subtotal: number; cap: number; contributions: PersonContribution[] }
    >;
    /** Points ignored because the evidence was below a rule's minimum. */
    rejected: { ruleId: string; confidence: Confidence; reason: string }[];
  };
}

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  VERIFIED: 3,
  STRONG_INFERENCE: 2,
  WEAK_INFERENCE: 1,
  UNKNOWN: 0,
};

const CATEGORIES: PersonCategory[] = ["AUTHORITY", "REACH", "CONTACTABILITY"];

/**
 * Pure. The same findings and configuration always produce the same score, and
 * every point traces to a named rule and the evidence that fired it.
 */
export function scorePerson(
  findings: ScorablePersonFinding[],
  config: PersonScoringConfig = defaultPersonScoringConfig(),
): PersonScoreResult {
  const ruleById = new Map(config.rules.map((r) => [r.id, r]));
  const byCategory: Record<PersonCategory, PersonContribution[]> = {
    AUTHORITY: [],
    REACH: [],
    CONTACTABILITY: [],
  };
  const rejected: PersonScoreResult["breakdown"]["rejected"] = [];

  for (const finding of findings) {
    if (finding.dismissed) continue;
    const rule = ruleById.get(finding.code);
    if (!rule) continue;

    // Weak evidence cannot fire a rule that requires a fact. Recorded rather
    // than silently dropped, so the breakdown shows what was set aside.
    if (CONFIDENCE_ORDER[finding.confidence] < CONFIDENCE_ORDER[rule.minConfidence]) {
      rejected.push({
        ruleId: rule.id,
        confidence: finding.confidence,
        reason: `Requires ${rule.minConfidence} evidence or better.`,
      });
      continue;
    }

    const basePoints = config.ruleWeights[rule.id] ?? rule.points;
    const multiplier = config.confidenceMultipliers[finding.confidence] ?? 0;
    const points = Math.round(basePoints * multiplier);
    if (points <= 0) continue;

    byCategory[rule.category].push({
      ruleId: rule.id,
      category: rule.category,
      label: rule.label,
      basePoints,
      confidence: finding.confidence,
      confidenceMultiplier: multiplier,
      points,
    });
  }

  const categories = {} as PersonScoreResult["breakdown"]["categories"];
  const subtotals = {} as Record<PersonCategory, number>;

  for (const category of CATEGORIES) {
    const contributions = byCategory[category];
    const cap = config.categoryCaps[category];
    const raw = contributions.reduce((total, c) => total + c.points, 0);
    const subtotal = Math.min(cap, raw);
    subtotals[category] = subtotal;
    categories[category] = { category, subtotal, cap, contributions };
  }

  const overallScore = Math.max(
    0,
    Math.min(100, CATEGORIES.reduce((total, c) => total + subtotals[c], 0)),
  );

  return {
    authorityScore: subtotals.AUTHORITY,
    reachScore: subtotals.REACH,
    contactabilityScore: subtotals.CONTACTABILITY,
    overallScore,
    confidence: overallConfidence(byCategory),
    rulesetVersion: config.version,
    breakdown: { rulesetVersion: config.version, categories, rejected },
  };
}

/**
 * Share of awarded points that came from verified evidence, matching how the
 * clinic engine reports confidence.
 */
function overallConfidence(
  byCategory: Record<PersonCategory, PersonContribution[]>,
): "HIGH" | "MEDIUM" | "LOW" {
  const all = CATEGORIES.flatMap((c) => byCategory[c]);
  const total = all.reduce((sum, c) => sum + c.points, 0);
  if (total === 0) return "LOW";
  const verified = all
    .filter((c) => c.confidence === Confidence.VERIFIED)
    .reduce((sum, c) => sum + c.points, 0);
  const share = verified / total;
  if (share >= 0.6) return "HIGH";
  if (share >= 0.3) return "MEDIUM";
  return "LOW";
}

/**
 * Order people by who is worth contacting first. Score decides, then verified
 * confidence, then name for a stable order. Used within and across clinics.
 */
export function rankPeople<T extends { score: PersonScoreResult; fullName: string }>(
  people: T[],
): T[] {
  const confidenceRank = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
  return [...people].sort((a, b) => {
    const byScore = b.score.overallScore - a.score.overallScore;
    if (byScore !== 0) return byScore;
    const byConfidence =
      confidenceRank[b.score.confidence] - confidenceRank[a.score.confidence];
    if (byConfidence !== 0) return byConfidence;
    return a.fullName.localeCompare(b.fullName);
  });
}
