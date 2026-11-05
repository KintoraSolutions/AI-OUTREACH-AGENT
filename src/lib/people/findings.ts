import { Confidence, DecisionRole } from "@prisma/client";
import { DECISION_ROLE_LABELS } from "@/lib/people/roles";

/**
 * Turn what we know about a person into evidence.
 *
 * This is the step that makes physician-level personalization possible at all.
 * `validateDraft` requires every factual claim about a recipient to map to a
 * stored finding with a source, and it indexes evidence by code without ever
 * reading the category. So a bio sitting in a table is not usable by the
 * drafter; the same fact recorded as a finding is. Anything the email may say
 * about a person has to come through here first.
 *
 * Shaped like `buildAuditFindings`: neutral observations, an evidence string
 * that states what was seen, a source URL, and a confidence level. `isFact` is
 * true only for VERIFIED, matching the rule used everywhere else.
 */
export interface PersonFindingInput {
  code: string;
  finding: string;
  evidence: string;
  sourceUrl: string;
  confidence: Confidence;
  isFact: boolean;
}

export interface PersonAffiliationView {
  clinicName: string;
  role: DecisionRole;
  roleTitle: string | null;
  isOwner: boolean;
  confidence: Confidence;
  sourceUrl: string;
}

/**
 * One code per role tier rather than a single `person_stated_role`.
 *
 * The scoring engine keys rules by code, so a single code could not express
 * that an owner outranks an associate. Splitting them is what lets
 * `scorePerson` weight authority without inspecting the finding text.
 */
export const ROLE_FINDING_CODE: Record<DecisionRole, string | null> = {
  OWNER: "person_role_owner",
  MEDICAL_DIRECTOR: "person_role_medical_director",
  LEAD_PHYSICIAN: "person_role_lead_physician",
  ADMIN_LEADER: "person_role_admin_leader",
  PHYSICIAN: "person_role_physician",
  OTHER: null,
};

/** Every code this module can emit, for pruning stale rows when a role changes. */
export const PERSON_FINDING_CODES: string[] = [
  ...Object.values(ROLE_FINDING_CODE).filter((c): c is string => c !== null),
  "person_multi_clinic",
  "person_direct_email",
];

/** Strongest first, so the role we cite is the most defensible one we hold. */
const ROLE_RANK: Record<DecisionRole, number> = {
  OWNER: 5,
  MEDICAL_DIRECTOR: 4,
  LEAD_PHYSICIAN: 3,
  ADMIN_LEADER: 2,
  PHYSICIAN: 1,
  OTHER: 0,
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  VERIFIED: 3,
  STRONG_INFERENCE: 2,
  WEAK_INFERENCE: 1,
  UNKNOWN: 0,
};

function strongest(affiliations: PersonAffiliationView[]): PersonAffiliationView | null {
  let best: PersonAffiliationView | null = null;
  for (const current of affiliations) {
    if (!best) {
      best = current;
      continue;
    }
    const byConfidence = CONFIDENCE_RANK[current.confidence] - CONFIDENCE_RANK[best.confidence];
    const byRole = ROLE_RANK[current.role] - ROLE_RANK[best.role];
    if (byConfidence > 0 || (byConfidence === 0 && byRole > 0)) best = current;
  }
  return best;
}

export function buildPersonFindings(
  fullName: string,
  affiliations: PersonAffiliationView[],
  publishedEmail: string | null = null,
): PersonFindingInput[] {
  const findings: PersonFindingInput[] = [];
  if (affiliations.length === 0) return findings;

  const lead = strongest(affiliations);
  if (!lead) return findings;

  // The role, cited from the page that printed it. Confidence carries through
  // from the classification, so a stated directorship is a fact and an
  // inferred lead role is not.
  const roleCode = ROLE_FINDING_CODE[lead.role];
  if (roleCode) {
    const printed = lead.roleTitle ?? DECISION_ROLE_LABELS[lead.role];
    findings.push({
      code: roleCode,
      finding: `Listed as ${printed} at ${lead.clinicName}.`,
      evidence: `${lead.clinicName} lists ${fullName} as "${printed}" on its own site.`,
      sourceUrl: lead.sourceUrl,
      confidence: lead.confidence,
      isFact: lead.confidence === Confidence.VERIFIED,
    });
  }

  // Being listed at several clinics is our own cross-source observation, not
  // something any one page states, so it is an inference however many sites
  // we saw. It is also the finding that makes a multi-location lead worth more
  // than a single-site one.
  if (affiliations.length >= 2) {
    const names = [...new Set(affiliations.map((a) => a.clinicName))].sort();
    findings.push({
      code: "person_multi_clinic",
      finding: `Listed at ${names.length} clinics in this pipeline.`,
      evidence: `${fullName} appears on the public sites of: ${names.join(", ")}.`,
      sourceUrl: lead.sourceUrl,
      confidence: Confidence.STRONG_INFERENCE,
      isFact: false,
    });
  }

  // A reachable decision-maker is worth more than an unreachable one, and this
  // is the only finding that says so. Verified because the address was printed
  // on the clinic's own page, never inferred.
  if (publishedEmail) {
    findings.push({
      code: "person_direct_email",
      finding: "Direct professional address published by the clinic.",
      evidence: `${lead.clinicName} publishes ${publishedEmail} for ${fullName}.`,
      sourceUrl: lead.sourceUrl,
      confidence: Confidence.VERIFIED,
      isFact: true,
    });
  }

  return findings;
}
