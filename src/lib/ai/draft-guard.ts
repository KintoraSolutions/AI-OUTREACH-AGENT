import type {
  ClaimMapping,
  EvidenceItem,
  OrgIdentity,
  OutreachStrategy,
} from "@/lib/ai/draft-types";
import type { DraftOutput } from "@/lib/ai/prompts";

/**
 * Deterministic hallucination + safety guard (plan.md Section 7), run AFTER
 * generation and BEFORE saving. It maps every claim to stored evidence and
 * blocks a draft that:
 *  - makes a claim with no supporting evidence,
 *  - relies on a dismissed finding,
 *  - claims lost calls / revenue / operational failure without verified evidence,
 *  - mentions how the data was gathered (scraping),
 *  - pretends to be a patient or fakes familiarity,
 *  - drops or alters the clinic name, or leaves an unfilled template placeholder.
 *
 * It only WARNS (does not block) for softer issues a human can weigh: wording
 * that rests on inference, an em dash, an out-of-band word count, a missing
 * portfolio link, or manufactured urgency.
 *
 * `scanContent` (the text checks) is exported so human edits can be re-validated
 * with the same rules, even though an edit has no model-supplied claim mapping.
 */

const LOSS_PATTERNS = [
  /losing (patients|calls|revenue|money|business|customers)/i,
  /missed (calls|revenue|appointments)/i,
  /lost (revenue|calls|patients|business|money)/i,
  /revenue loss|loss of revenue/i,
  /operational (failure|failures|breakdown)/i,
  /you(?:'re| are) losing/i,
];
const SCRAPE_PATTERNS = [
  /scrap(e|ed|ing)/i,
  /crawl(ed|ing|er)?/i,
  /we\s+found\s+your/i,
  /pulled\s+your\s+(data|info)/i,
];
const IMPERSONATION_PATTERNS = [
  /as a (potential )?patient/i,
  /i(?:'m| am) a patient/i,
  /i (visited|called|booked|came to) your/i,
];
const URGENCY_PATTERNS = [/act now/i, /limited time/i, /urgent/i, /don'?t miss/i, /expires/i, /last chance/i];
const PLACEHOLDER_PATTERN = /\[[A-Za-z][^\]]*\]|\{\{|\}\}/;

export interface ContentScanInput {
  body: string;
  subject: string;
  clinicName: string;
  org: OrgIdentity;
  strategy: OutreachStrategy;
  /** Whether any citable evidence is a verified fact (gates loss/revenue claims). */
  hasVerifiedEvidence: boolean;
}

export interface ContentScan {
  blockedReasons: string[];
  warnings: string[];
  wordCount: number;
}

/** Text-only safety + style checks; shared by generation and human edits. */
export function scanContent(input: ContentScanInput): ContentScan {
  const { body, subject, clinicName, org, strategy, hasVerifiedEvidence } = input;
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  if (LOSS_PATTERNS.some((re) => re.test(body)) && !hasVerifiedEvidence) {
    blockedReasons.push(
      "The draft asserts lost calls, lost revenue, or operational failure without verified evidence.",
    );
  }
  if (SCRAPE_PATTERNS.some((re) => re.test(body))) {
    blockedReasons.push("The draft references how the clinic's information was gathered.");
  }
  if (IMPERSONATION_PATTERNS.some((re) => re.test(body))) {
    blockedReasons.push("The draft pretends to be a patient or fakes familiarity.");
  }
  if (PLACEHOLDER_PATTERN.test(body)) {
    blockedReasons.push("The draft contains an unfilled template placeholder.");
  }
  if (clinicName.trim() && !body.includes(clinicName.trim())) {
    blockedReasons.push("The draft does not use the clinic's exact name.");
  }

  if (/—/.test(body) || /—/.test(subject)) warnings.push("Contains an em dash; remove before sending.");
  if (URGENCY_PATTERNS.some((re) => re.test(body))) warnings.push("Contains urgency wording; soften before sending.");

  const wordCount = countWords(body);
  if (wordCount < 80 || wordCount > 150) {
    warnings.push(`Body is ${wordCount} words; the target is 80 to 150.`);
  }

  if (strategy === "WEBSITE" || strategy === "COMBINED") {
    const portfolio = org.portfolioUrl?.trim();
    if (portfolio && !body.includes(portfolio) && !body.includes(stripScheme(portfolio))) {
      warnings.push("Website pitch is missing the portfolio link.");
    } else if (!portfolio) {
      warnings.push("Portfolio URL is not configured; add it in Settings before sending a website pitch.");
    }
  }

  return { blockedReasons, warnings, wordCount };
}

export interface DraftGuardInput {
  output: DraftOutput;
  clinicName: string;
  org: OrgIdentity;
  strategy: OutreachStrategy;
  /** Citable evidence keyed by code (non-dismissed, sufficiently supported). */
  citableByCode: Map<string, EvidenceItem>;
  /** Codes of findings that were dismissed (for a precise message). */
  dismissedCodes: Set<string>;
}

export interface DraftGuardResult {
  blocked: boolean;
  blockedReasons: string[];
  warnings: string[];
  claimMap: ClaimMapping[];
  usedEvidence: EvidenceItem[];
  wordCount: number;
}

export function validateDraft(input: DraftGuardInput): DraftGuardResult {
  const { output, clinicName, org, strategy, citableByCode, dismissedCodes } = input;
  const blockedReasons: string[] = [];
  const claimMap: ClaimMapping[] = [];
  const usedCodes = new Set<string>();
  const hasVerifiedEvidence = [...citableByCode.values()].some((e) => e.isFact);

  // --- Claim-to-evidence mapping ---
  for (const claim of output.claims) {
    const code = claim.evidenceCode ?? null;
    if (code === null) {
      // Generic (non clinic-specific) statement or the call to action.
      claimMap.push({ claim: claim.text, code: null, supported: true });
      continue;
    }
    if (dismissedCodes.has(code)) {
      claimMap.push({ claim: claim.text, code, supported: false });
      blockedReasons.push(`A claim relies on a dismissed finding (${code}).`);
      continue;
    }
    const evidence = citableByCode.get(code);
    if (!evidence) {
      claimMap.push({ claim: claim.text, code, supported: false });
      blockedReasons.push(`A claim cites evidence that does not exist or is not sufficiently supported (${code}).`);
      continue;
    }
    claimMap.push({ claim: claim.text, code, supported: true });
    usedCodes.add(code);
  }

  // --- Shared text checks ---
  const scan = scanContent({
    body: output.body,
    subject: output.subject,
    clinicName,
    org,
    strategy,
    hasVerifiedEvidence,
  });
  blockedReasons.push(...scan.blockedReasons);
  const warnings = [...scan.warnings];

  const usedEvidence = [...usedCodes].map((c) => citableByCode.get(c)!).filter(Boolean);
  if (usedEvidence.length > 0 && !usedEvidence.some((e) => e.isFact)) {
    warnings.push("Wording rests on inference-level evidence; verify before sending.");
  }

  return {
    blocked: blockedReasons.length > 0,
    blockedReasons,
    warnings,
    claimMap,
    usedEvidence,
    wordCount: scan.wordCount,
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
