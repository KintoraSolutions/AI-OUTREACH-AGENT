import { Confidence } from "@prisma/client";
import type { DraftFinding, EvidenceItem } from "@/lib/ai/draft-types";

/**
 * Turns stored findings into the set of observations the drafting engine is
 * allowed to state. Only NON-DISMISSED findings that are "sufficiently
 * supported" (VERIFIED or STRONG_INFERENCE) are citable. Weak inferences and
 * unknowns are deliberately excluded, so the engine can never write a weak
 * inference as if it were established (docs/planning/build-plan.md Section 7 hallucination rules).
 *
 * A manual score override is NOT evidence: it changes which service is pitched,
 * but the only things a draft may state come from these findings.
 */

const CITABLE: Confidence[] = [Confidence.VERIFIED, Confidence.STRONG_INFERENCE];

const CONFIDENCE_RANK: Record<Confidence, number> = {
  UNKNOWN: 0,
  WEAK_INFERENCE: 1,
  STRONG_INFERENCE: 2,
  VERIFIED: 3,
};

export function toEvidenceItem(f: DraftFinding): EvidenceItem {
  return {
    findingId: f.id,
    code: f.code,
    category: f.category,
    observation: f.finding,
    detail: f.evidence,
    sourceUrl: f.sourceUrl,
    confidence: f.confidence,
    isFact: f.isFact,
  };
}

/**
 * Citable evidence, strongest first (verified before strong inference), so the
 * prompt leads with the most defensible observations.
 */
export function buildCitableEvidence(findings: DraftFinding[]): EvidenceItem[] {
  return findings
    .filter((f) => !f.dismissed && CITABLE.includes(f.confidence))
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])
    .map(toEvidenceItem);
}

/** Index citable evidence by code (codes are unique per clinic). */
export function indexByCode(items: EvidenceItem[]): Map<string, EvidenceItem> {
  return new Map(items.map((e) => [e.code, e]));
}
