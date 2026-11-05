import { FindingCategory } from "@prisma/client";

/**
 * Outreach use cases: WHO the organization is emailing and WHY. A use case sets
 * the recipient's role, the default objective, the call-to-action shape, extra
 * guardrails, and — most importantly — the EVIDENCE POLICY that decides what may
 * ground a claim about the recipient.
 *
 * This is a first-class, expandable concept: adding a use case is one entry in
 * `USE_CASES` plus a key in `USE_CASE_VALUES`.
 *
 * The evidence policy never LOOSENS the hallucination guard. Every claim a draft
 * makes about a recipient must still map to stored, sufficiently-supported
 * evidence (`validateDraft`). The policy only decides WHICH finding categories
 * are relevant for this kind of outreach, and whether an email that makes no
 * recipient-specific claims at all is a legitimate outcome (an introduction)
 * rather than a blocked draft.
 */

export const USE_CASE_VALUES = ["service_pitch", "patient_referral"] as const;
export type UseCaseKey = (typeof USE_CASE_VALUES)[number];

export interface EvidencePolicy {
  /** Finding categories whose evidence may ground a claim for this use case. */
  citableCategories: FindingCategory[];
  /**
   * When true, an email that makes NO recipient-specific claims is valid. Used
   * by introductions, where the sender describes only themselves. Claims still
   * have to be evidence-backed; there simply may be none.
   */
  allowClaimFreeIntro: boolean;
  /**
   * When true (the service-pitch model), a draft requires opportunity evidence
   * in the pitched area or it is blocked as insufficient.
   */
  requireOpportunityEvidence: boolean;
}

export interface OutreachUseCase {
  key: UseCaseKey;
  label: string;
  description: string;
  /** How the recipient is described to the model. */
  recipientRole: string;
  /** Default objective when the org has not written its own. */
  objectiveHint: string;
  ctaGuidance: string;
  /** Additive restrictions. These may only ADD to the system prompt's rules. */
  guardrails: string[];
  evidencePolicy: EvidencePolicy;
}

const SERVICE_PITCH: OutreachUseCase = {
  key: "service_pitch",
  label: "Service pitch",
  description:
    "You are offering a product or service to another business, grounded in specific opportunities found during research.",
  recipientRole: "a decision maker at the recipient organization",
  objectiveHint: "Open a conversation about a specific, evidenced opportunity.",
  ctaGuidance: "Use one low-pressure call to action, such as offering a short call or a few specific ideas.",
  guardrails: [],
  evidencePolicy: {
    citableCategories: [FindingCategory.WEBSITE, FindingCategory.SOFTWARE, FindingCategory.KLEARQ],
    allowClaimFreeIntro: false,
    requireOpportunityEvidence: true,
  },
};

const PATIENT_REFERRAL: OutreachUseCase = {
  key: "patient_referral",
  label: "Patient referrals",
  description:
    "You are a healthcare provider introducing your practice to another provider who may refer patients to you.",
  recipientRole: "a fellow healthcare provider who may refer patients",
  objectiveHint:
    "Introduce your practice as a referral option and make it easy to start referring.",
  ctaGuidance:
    "Use one low-pressure call to action, such as offering your referral details or a brief introductory call. Never pressure for referrals.",
  guardrails: [
    "Never reference any patient, patient identifier, medical condition, treatment, or any other protected health information. This applies even if such information appears elsewhere in the provided context.",
    "Never make any claim about the recipient's clinical judgment, competence, or the quality of care they provide.",
    "Never imply an existing clinical or referral relationship that has not been established.",
    "Do not promise medical outcomes, and do not present your services as medical advice.",
  ],
  evidencePolicy: {
    // Referral outreach is grounded in verified profile facts (what kind of
    // practice they are, where they are, how to reach them) rather than in
    // "problems" found on their website.
    citableCategories: [
      FindingCategory.BUSINESS_FIT,
      FindingCategory.CONTACTABILITY,
      FindingCategory.WEBSITE,
    ],
    allowClaimFreeIntro: true,
    requireOpportunityEvidence: false,
  },
};

export const USE_CASES: Record<UseCaseKey, OutreachUseCase> = {
  service_pitch: SERVICE_PITCH,
  patient_referral: PATIENT_REFERRAL,
};

export const DEFAULT_USE_CASE_KEY: UseCaseKey = "service_pitch";

export function getUseCase(key: UseCaseKey): OutreachUseCase {
  return USE_CASES[key] ?? SERVICE_PITCH;
}

export const USE_CASE_LABELS: Record<UseCaseKey, string> = {
  service_pitch: SERVICE_PITCH.label,
  patient_referral: PATIENT_REFERRAL.label,
};
