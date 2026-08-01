import type { Confidence, FindingCategory } from "@prisma/client";
import type { ResearchFinding } from "@/lib/research/types";
import type { ScorableFinding } from "@/lib/scoring/types";

/** Fresh audit findings (from the research pipeline) -> scorer input. */
export function toScorableFindings(findings: ResearchFinding[]): ScorableFinding[] {
  return findings.map((f) => ({
    code: f.code,
    category: f.category,
    confidence: f.confidence,
    finding: f.finding,
    evidence: f.evidence,
    sourceUrl: f.sourceUrl,
    isFact: f.isFact,
    manual: false,
  }));
}

/** A stored AuditFinding row (the subset the scorer needs), for re-scoring. */
export interface StoredFindingRow {
  code: string;
  category: FindingCategory;
  confidence: Confidence;
  finding: string;
  evidence: string;
  sourceUrl: string;
  isFact: boolean;
  manual: boolean;
  manualPoints: number | null;
  dismissed: boolean;
}

/** Stored findings (from the database) -> scorer input, excluding dismissed. */
export function storedToScorableFindings(rows: StoredFindingRow[]): ScorableFinding[] {
  return rows
    .filter((r) => !r.dismissed)
    .map((r) => ({
      code: r.code,
      category: r.category,
      confidence: r.confidence,
      finding: r.finding,
      evidence: r.evidence,
      sourceUrl: r.sourceUrl,
      isFact: r.isFact,
      manual: r.manual,
      manualPoints: r.manualPoints,
    }));
}
