import type { ExtractedPerson } from "@/lib/people/extract-team";
import type { Confidence, FindingCategory } from "@prisma/client";
import type { ScoreResult, ScoringConfig } from "@/lib/scoring/types";

/**
 * Shared contracts for the research engine. Everything here is
 * runner-agnostic and provider-agnostic so the pure pipeline steps and their
 * tests never depend on Prisma, Inngest, or a specific search API
 * (docs/planning/build-plan.md Section 5, decisions 2 and 3).
 */

// ---------------------------------------------------------------------------
// Campaign criteria (subset of SearchCampaign the pipeline needs)
// ---------------------------------------------------------------------------

export interface CampaignCriteria {
  categories: string[];
  city: string | null;
  region: string | null;
  country: string | null;
  radiusMeters: number | null;
  minLocations: number;
  maxLeads: number;
  requiredKeywords: string[];
  excludedKeywords: string[];
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** A candidate clinic returned by a discovery provider (public business info). */
export interface DiscoveredClinic {
  name: string;
  websiteUrl: string | null;
  mainPhone: string | null;
  address: string | null;
  category: string | null;
  locationCount: number | null;
  /** Provider-specific id (e.g. Google place id), used for provenance only. */
  externalId: string | null;
  /** The provider result URL this record came from, stored as a Source. */
  sourceUrl: string;
  /** Free-text signals used for keyword filtering (types, summary, etc.). */
  keywordsHaystack: string;
}

export interface DiscoveryProvider {
  readonly name: string;
  isConfigured(): boolean;
  /**
   * Returns up to `limit` candidate clinics. Implementations must use compliant
   * API access only (no map/HTML scraping) and must not attempt to bypass rate
   * limits, auth, or platform terms.
   */
  discover(
    criteria: CampaignCriteria,
    limit: number,
  ): Promise<DiscoveredClinic[]>;
}

// ---------------------------------------------------------------------------
// Website fetching (robots-aware, rate-limited, SSRF-guarded)
// ---------------------------------------------------------------------------

export interface FetchResult {
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
}

export interface WebsiteFetcher {
  readonly name: string;
  /**
   * Fetch a URL as HTML. Implementations MUST check robots.txt first, honor
   * crawl-delay, rate-limit per domain, refuse non-public targets, and throw a
   * NonRecoverableError on robots disallow / access walls rather than bypassing.
   */
  fetch(url: string): Promise<FetchResult>;
}

// ---------------------------------------------------------------------------
// Performance auditing
// ---------------------------------------------------------------------------

export interface PerformanceResult {
  url: string;
  performanceScore: number | null; // 0-100
  lcpMs: number | null;
  cls: number | null;
  mobileFriendly: boolean | null;
}

export interface PerformanceProvider {
  readonly name: string;
  isConfigured(): boolean;
  audit(url: string): Promise<PerformanceResult>;
}

// ---------------------------------------------------------------------------
// Headless browser (deferred for MVP)
// ---------------------------------------------------------------------------

export interface BrowserCapabilities {
  screenshots: boolean;
  renderedAudit: boolean;
  consoleErrors: boolean;
}

export interface BrowserProvider {
  readonly name: string;
  isConfigured(): boolean;
  capabilities(): BrowserCapabilities;
}

// ---------------------------------------------------------------------------
// Extraction + analysis output
// ---------------------------------------------------------------------------

export interface ExtractedLocation {
  label: string | null;
  address: string | null;
  phone: string | null;
}

export interface ExtractedSiteInfo {
  title: string | null;
  metaDescription: string | null;
  publicEmails: string[];
  phones: string[];
  contactPageUrl: string | null;
  onlineBookingUrl: string | null;
  bookingMethod: string | null;
  socialLinks: Record<string, string>;
  services: string[];
  locations: ExtractedLocation[];
  hasViewportMeta: boolean;
  hasContactForm: boolean;
  isHttps: boolean;
  bookingPlatform: string | null;
  /** All distinct booking platforms detected (>1 signals disconnected systems). */
  bookingPlatforms: string[];
  /** Downloadable/printable intake or referral forms (e.g. linked PDFs). */
  hasDownloadableForms: boolean;
  /** The site text mentions referrals (a common manual workflow). */
  mentionsReferral: boolean;
  /** The site text mentions departments (multi-department signal). */
  mentionsDepartments: boolean;
  /** Count of anchor links (a rough navigation-complexity proxy). */
  linkCount: number;
}

export interface ResearchFinding {
  category: FindingCategory;
  code: string;
  finding: string;
  evidence: string;
  sourceUrl: string;
  confidence: Confidence;
  /** True only for verified facts; everything else is an inference. */
  isFact: boolean;
  /** Optional website sub-area for grouping (design | technical | conversion). */
  subarea?: string | null;
}

/** A single source URL retrieved during research, with its collection time. */
export interface CollectedSource {
  url: string;
  type: string; // "discovery" | "website" | "robots" | "performance" | "contact_page"
  notes?: string;
}

/**
 * The full result of researching one clinic. Written as a unit by the
 * repository. Any sub-step may be missing (partial results are expected when a
 * website fails); `errors` records soft failures that did not stop the record.
 */
export interface ClinicResearchResult {
  candidate: DiscoveredClinic;
  dedupeKey: string;
  websiteUrl: string | null;
  mainPhone: string | null;
  publicEmail: string | null;
  contactPageUrl: string | null;
  bookingMethod: string | null;
  onlineBookingUrl: string | null;
  socialLinks: Record<string, string>;
  websiteTech: string[];
  locationCount: number;
  locations: ExtractedLocation[];
  audit: PerformanceResult | null;
  findings: ResearchFinding[];
  sources: CollectedSource[];
  /**
   * Decision-makers the clinic publishes about itself, from its own site only.
   * Empty is a normal outcome: many clinics list no team, and the lead then
   * falls back to the general inbox exactly as before.
   */
  people: ExtractedPerson[];
  /** Non-fatal problems encountered while enriching (e.g. site unreachable). */
  softErrors: { targetUrl: string | null; message: string; retryable: boolean }[];
}

// ---------------------------------------------------------------------------
// Job context + repository (persistence boundary)
// ---------------------------------------------------------------------------

export interface JobControl {
  cancelRequested: boolean;
  pauseRequested: boolean;
}

/**
 * Durable-step boundary (decision 3). The orchestrator wraps each unit of work
 * in `steps.run(id, fn)`. Inline/test runs use a pass-through that just calls
 * `fn`; the Inngest runner supplies an adapter over `step.run`, which memoizes
 * each completed step so retries, restarts, and duplicate event delivery never
 * repeat finished work. The pipeline depends only on this tiny interface, so it
 * never imports Inngest and stays runner-agnostic.
 *
 * `T` must be JSON-serializable: under Inngest the return value is persisted and
 * replayed, so results carry plain data only (no class instances or Dates).
 */
export interface JobStepRunner {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Persistence boundary for the orchestrator. The Prisma implementation talks to
 * the database; tests supply an in-memory implementation so the whole workflow
 * can be exercised without Postgres (docs/planning/build-plan.md Section 13, decision 6).
 */
export interface ResearchRepository {
  loadCriteria(campaignId: string): Promise<{ orgId: string; criteria: CampaignCriteria } | null>;
  existingDedupeKeys(orgId: string): Promise<Set<string>>;
  /** The org's effective scoring configuration (defaults + stored overrides). */
  loadScoringConfig(orgId: string): Promise<ScoringConfig>;
  readControl(jobId: string): Promise<JobControl>;
  updateJob(jobId: string, patch: JobPatch): Promise<void>;
  /**
   * Persist one enriched + audited + scored clinic as a unit. Returns
   * "duplicate" if it already exists (so retries never create duplicate clinics,
   * findings, or scores).
   */
  saveClinic(
    orgId: string,
    campaignId: string,
    result: ClinicResearchResult,
    score: ScoreResult,
  ): Promise<"created" | "duplicate">;
  logError(jobId: string, error: LoggedError): Promise<void>;
  setCampaignStatus(campaignId: string, status: CampaignRunStatus): Promise<void>;
}

export interface JobPatch {
  status?: JobRunStatus;
  total?: number;
  processed?: number;
  succeeded?: number;
  failed?: number;
  progress?: number;
  message?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface LoggedError {
  scope: string;
  targetUrl?: string | null;
  message: string;
  stack?: string | null;
  retryable: boolean;
}

export type JobRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "PARTIAL";

export type CampaignRunStatus =
  | "DRAFT"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

/** Providers the pipeline depends on; injected so tests can supply fakes. */
export interface ProviderBundle {
  discovery: DiscoveryProvider;
  fetcher: WebsiteFetcher;
  performance: PerformanceProvider;
  browser: BrowserProvider;
}
