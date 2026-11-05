import type {
  Confidence,
  FindingCategory,
  RecommendedService,
  ScoreConfidence,
} from "@prisma/client";

/**
 * Domain types for the evidence-grounded drafting engine (docs/planning/build-plan.md Section 7).
 * Everything here is pure data: the engine reasons over stored evidence only and
 * never invents facts.
 */

/** A stored audit finding as the drafting engine consumes it. */
export interface DraftFinding {
  /** AuditFinding.id — the evidence id recorded on the draft. */
  id: string;
  /** Stable rule/finding code (unique per clinic). */
  code: string;
  category: FindingCategory;
  finding: string;
  evidence: string;
  sourceUrl: string;
  confidence: Confidence;
  isFact: boolean;
  dismissed: boolean;
}

/** A citable piece of evidence (non-dismissed, sufficiently supported). */
export interface EvidenceItem {
  findingId: string;
  code: string;
  category: FindingCategory;
  /** Neutral observation text (the finding). */
  observation: string;
  /** Supporting detail (the evidence). */
  detail: string;
  sourceUrl: string;
  confidence: Confidence;
  isFact: boolean;
}

/**
 * Org identity used to fill the pitch (never hardcoded; comes from settings).
 * What the org SELLS lives in its AI profile offerings, not here.
 */
export interface OrgIdentity {
  companyName: string | null;
  portfolioUrl: string | null;
  contactUrl: string | null;
  senderName: string | null;
  senderEmail: string | null;
}

/** Clinic + recipient context for the draft. */
export interface DraftClinic {
  name: string;
  recipientName: string | null;
  recipientEmail: string | null;
}

/** Effective (override-aware) score summary the strategy selection reads. */
export interface DraftScoreSummary {
  /** Service the user sees (override applied by the caller). */
  effectiveService: RecommendedService;
  /** Service the engine computed (before any override). */
  computedService: RecommendedService;
  confidence: ScoreConfidence;
  websiteScore: number;
  softwareScore: number;
  klearqScore: number;
  manualOverride: boolean;
}

export type OutreachStrategy = "WEBSITE" | "SOFTWARE" | "KLEARQ" | "COMBINED" | "INSUFFICIENT";

export interface StrategySelection {
  strategy: OutreachStrategy;
  /** Enum form for storage (INSUFFICIENT -> NONE). */
  service: RecommendedService;
  reason: string;
  /** Citable evidence in the chosen opportunity area(s), strongest first. */
  supportingEvidence: EvidenceItem[];
  /** Whether a manual override drove the strategy. */
  overrideApplied: boolean;
  /** True when supporting evidence exists but none of it is a verified fact. */
  onlyInference: boolean;
}

/** One claim in the draft mapped to the evidence that supports it. */
export interface ClaimMapping {
  claim: string;
  code: string | null;
  supported: boolean;
}

/** Evidence actually used by the draft (stored on the EmailDraft). */
export interface PersonalizationEvidenceItem {
  findingId: string;
  code: string;
  category: FindingCategory;
  claim: string;
  sourceUrl: string;
  confidence: Confidence;
  isFact: boolean;
}

export interface DraftResult {
  status: "GENERATED" | "BLOCKED";
  service: RecommendedService;
  strategy: OutreachStrategy;
  strategyReason: string;
  subject: string;
  body: string;
  personalizationEvidence: PersonalizationEvidenceItem[];
  claimMap: ClaimMapping[];
  evidenceFindingIds: string[];
  evidenceSourceUrls: string[];
  reviewWarnings: string[];
  blockedReason: string | null;
  confidence: number;
  wordCount: number;
  promptVersion: string;
  aiModel: string;
  aiProvider: string;
}
