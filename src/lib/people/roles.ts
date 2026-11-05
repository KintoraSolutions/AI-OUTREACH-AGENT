import { Confidence, DecisionRole } from "@prisma/client";

/**
 * Classify a job title printed on a clinic's own website into the influence it
 * implies over operational and purchasing decisions.
 *
 * Two things this must get right, because everything downstream inherits them.
 *
 * **Confidence is evidential, not enthusiastic.** A title is `VERIFIED` only
 * when the clinic itself states the role in words that admit one reading:
 * "Owner", "Founder", "Medical Director". "Lead physician" is a strong
 * inference about authority, not a statement of it. A bare "Dr. Jane Smith" is
 * a weak inference at best, and that matters: the scoring rule
 * `contact_decision_maker_email` requires `VERIFIED`, so only an explicitly
 * stated ownership or directorship role can ever fire it.
 *
 * **Not everyone listed on a team page is a lead.** Receptionists, assistants,
 * hygienists, students and residents are staff, and treating them as
 * decision-makers is exactly the failure the physician-outreach work exists to
 * fix. Those return `null`, meaning "found a person, not a decision-maker",
 * and the caller skips them rather than storing a bad lead.
 *
 * Dependency-free and pure, matching `src/lib/research/extract.ts`.
 */
export interface RoleClassification {
  role: DecisionRole;
  /** The title as printed, trimmed. Kept verbatim for the evidence string. */
  roleTitle: string;
  isOwner: boolean;
  confidence: Confidence;
}

/**
 * Roles that are clinical or administrative staff rather than decision-makers.
 * Checked first: "Receptionist" must never fall through to the physician
 * pattern because the word "clinic" appears beside it.
 */
const EXCLUDED =
  /\b(?:receptionist|front[\s-]?desk|medical office assistant|m\.?o\.?a\.?|secretar(?:y|ial)|administrative assistant|executive assistant|hygienist|assistant\b|student|resident|intern(?:e|ship)?\b|volunteer|co[\s-]?op|technician|technologist|billing|bookkeeper)\b/i;

/**
 * Ordered strongest first. The first match wins, so a title reading
 * "Founder & Medical Director" classifies as OWNER rather than director.
 */
const PATTERNS: {
  role: DecisionRole;
  confidence: Confidence;
  isOwner: boolean;
  pattern: RegExp;
}[] = [
  {
    role: DecisionRole.OWNER,
    confidence: Confidence.VERIFIED,
    isOwner: true,
    pattern: /\b(?:owner|co[\s-]?owner|founder|co[\s-]?founder|founding (?:partner|physician|doctor)|proprietor|principal)\b/i,
  },
  {
    role: DecisionRole.MEDICAL_DIRECTOR,
    confidence: Confidence.VERIFIED,
    isOwner: false,
    pattern: /\b(?:medical director|clinic director|clinical director|director of (?:the )?clinic|chief medical officer|c\.?m\.?o\.?)\b/i,
  },
  {
    role: DecisionRole.LEAD_PHYSICIAN,
    confidence: Confidence.STRONG_INFERENCE,
    isOwner: false,
    pattern: /\b(?:lead (?:physician|doctor|optometrist|dentist|chiropractor|physiotherapist|therapist)|head (?:physician|doctor|of (?:the )?(?:practice|clinic))|chief of|senior (?:partner|physician|associate)|managing partner|partner\b)/i,
  },
  {
    role: DecisionRole.ADMIN_LEADER,
    confidence: Confidence.STRONG_INFERENCE,
    isOwner: false,
    // Practice and operations managers routinely hold the purchasing decision
    // even though they are not clinicians, which is the whole point of looking.
    pattern: /\b(?:practice manager|clinic manager|office manager|operations manager|director of operations|practice administrator|clinic administrator|general manager)\b/i,
  },
  {
    role: DecisionRole.PHYSICIAN,
    confidence: Confidence.WEAK_INFERENCE,
    isOwner: false,
    pattern: /\b(?:dr\.?|physician|doctor|optometrist|dentist|orthodontist|chiropractor|physiotherapist|podiatrist|dermatologist|audiologist|psychologist|naturopath|m\.?d\.?|d\.?d\.?s\.?|o\.?d\.?|d\.?c\.?)\b/i,
  },
];

/**
 * Returns the classification, or `null` when the title belongs to someone who
 * is not a decision-maker (or is not a role at all).
 */
export function classifyRole(rawTitle: string | null | undefined): RoleClassification | null {
  if (!rawTitle) return null;

  const roleTitle = rawTitle.replace(/\s+/g, " ").trim();
  if (!roleTitle || roleTitle.length > 160) return null;

  if (EXCLUDED.test(roleTitle)) return null;

  for (const entry of PATTERNS) {
    if (entry.pattern.test(roleTitle)) {
      return {
        role: entry.role,
        roleTitle,
        isOwner: entry.isOwner,
        confidence: entry.confidence,
      };
    }
  }
  return null;
}

/**
 * Whether a role implies meaningful influence over purchasing.
 *
 * `PHYSICIAN` is deliberately excluded: an associate listed on a team page is
 * a person we can name, not someone we can say makes decisions, and claiming
 * otherwise in a draft would be a claim no evidence supports.
 */
export function isDecisionMakerRole(role: DecisionRole): boolean {
  return (
    role === DecisionRole.OWNER ||
    role === DecisionRole.MEDICAL_DIRECTOR ||
    role === DecisionRole.LEAD_PHYSICIAN ||
    role === DecisionRole.ADMIN_LEADER
  );
}

/** Human-readable label, for the UI and for evidence strings. */
export const DECISION_ROLE_LABELS: Record<DecisionRole, string> = {
  OWNER: "Owner",
  MEDICAL_DIRECTOR: "Medical director",
  LEAD_PHYSICIAN: "Lead physician",
  ADMIN_LEADER: "Practice leadership",
  PHYSICIAN: "Physician",
  OTHER: "Other",
};
