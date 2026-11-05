import type { ClaimMapping, EvidenceItem, OutreachStrategy } from "@/lib/ai/draft-types";
import type { DraftOutput } from "@/lib/ai/prompts";
import { DEFAULT_WORD_BAND, type WordBand } from "@/lib/ai/email-voice";

/**
 * Deterministic hallucination + safety guard (docs/planning/build-plan.md Section 7), run AFTER
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

/**
 * Protected health information. Deliberately NARROW: only phrasing that implies
 * an identifiable individual's health data, so ordinary referral copy such as
 * "we treat vertigo" or "we send patients back with clear notes" is untouched.
 * Applied only for use cases that set `blockPhi` (provider-to-provider referral).
 */
const PHI_PATTERNS = [
  /\bMRN\b/i,
  /medical record (number|#)/i,
  /\b(date of birth|DOB)\b/i,
  /health (record|information) (number|#)/i,
  /patient (chart|file|record)\b/i,
  /\byour patient\s+[A-Z][a-z]+/,
  /\bPHI\b/,
];

export interface ContentScanInput {
  body: string;
  subject: string;
  clinicName: string;
  /** Whether any citable evidence is a verified fact (gates loss/revenue claims). */
  hasVerifiedEvidence: boolean;
  /** Target body length. Defaults to the standard band. */
  wordBand?: WordBand;
  /** Links the prompt asked for; a missing one is a warning, not a block. */
  expectedLinks?: string[];
  /** Block protected health information (referral outreach between providers). */
  blockPhi?: boolean;
}

export interface ContentScan {
  blockedReasons: string[];
  warnings: string[];
  wordCount: number;
}

/** Text-only safety + style checks; shared by generation and human edits. */
export function scanContent(input: ContentScanInput): ContentScan {
  const { body, subject, clinicName, hasVerifiedEvidence } = input;
  const band = input.wordBand ?? DEFAULT_WORD_BAND;
  const expectedLinks = input.expectedLinks ?? [];
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  if (input.blockPhi && PHI_PATTERNS.some((re) => re.test(body))) {
    blockedReasons.push(
      "The draft appears to reference protected health information about a patient.",
    );
  }

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
  if (wordCount < band.min || wordCount > band.max) {
    warnings.push(`Body is ${wordCount} words; the target is ${band.min} to ${band.max}.`);
  }

  for (const link of expectedLinks) {
    const url = link.trim();
    if (!url) continue;
    if (!body.includes(url) && !body.includes(stripScheme(url))) {
      warnings.push(`The draft is missing the supporting link ${url}.`);
    }
  }

  return { blockedReasons, warnings, wordCount };
}

export interface DraftGuardInput {
  output: DraftOutput;
  clinicName: string;
  strategy: OutreachStrategy;
  /** Citable evidence keyed by code (non-dismissed, sufficiently supported). */
  citableByCode: Map<string, EvidenceItem>;
  /** Codes of findings that were dismissed (for a precise message). */
  dismissedCodes: Set<string>;
  wordBand?: WordBand;
  expectedLinks?: string[];
  blockPhi?: boolean;
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
  const { output, clinicName, citableByCode, dismissedCodes } = input;
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
    hasVerifiedEvidence,
    wordBand: input.wordBand,
    expectedLinks: input.expectedLinks,
    blockPhi: input.blockPhi,
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
