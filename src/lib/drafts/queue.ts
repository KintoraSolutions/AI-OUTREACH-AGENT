import { DraftStatus, RecommendedService } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveServiceOf } from "@/lib/leads/score-filter";

/**
 * The draft review queue.
 *
 * Bulk drafting could always generate many drafts at once, but there was no way
 * to work through them: the leads list has fifteen filters and none of them
 * touch drafts, so reviewing meant opening leads one at a time and guessing
 * which ones had something waiting. This module is the missing half.
 */

export const REVIEW_BUCKETS = [
  { value: "review", label: "Needs review" },
  { value: "blocked", label: "Blocked" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

export type ReviewBucket = (typeof REVIEW_BUCKETS)[number]["value"];

export const DEFAULT_BUCKET: ReviewBucket = "review";

export function isReviewBucket(value: string | undefined): value is ReviewBucket {
  return REVIEW_BUCKETS.some((b) => b.value === value);
}

/**
 * GENERATED and EDITED are both "a human has not decided yet" — an edit puts a
 * draft back in the queue rather than out of it.
 */
const BUCKET_STATUSES: Record<ReviewBucket, DraftStatus[]> = {
  review: [DraftStatus.GENERATED, DraftStatus.EDITED],
  blocked: [DraftStatus.BLOCKED],
  approved: [DraftStatus.APPROVED],
  rejected: [DraftStatus.REJECTED],
};

export interface QueueItem {
  clinicId: string;
  clinicName: string;
  category: string | null;
  status: DraftStatus;
  confidence: number;
  wordCount: number | null;
  warningCount: number;
  hasRecipient: boolean;
  version: number;
  overallScore: number | null;
  generatedAt: string;
}

export type BucketCounts = Record<ReviewBucket, number>;

/** Counts for every tab, so the tab strip never lies about an empty bucket. */
export async function loadBucketCounts(orgId: string): Promise<BucketCounts> {
  const rows = await prisma.emailDraft.groupBy({
    by: ["status"],
    where: { clinic: { orgId } },
    _count: { _all: true },
  });

  const byStatus = new Map(rows.map((r) => [r.status, r._count._all]));
  const sum = (statuses: DraftStatus[]) =>
    statuses.reduce((total, s) => total + (byStatus.get(s) ?? 0), 0);

  return {
    review: sum(BUCKET_STATUSES.review),
    blocked: sum(BUCKET_STATUSES.blocked),
    approved: sum(BUCKET_STATUSES.approved),
    rejected: sum(BUCKET_STATUSES.rejected),
  };
}

/**
 * The queue for one bucket. Ordered strongest-lead-first so the most promising
 * outreach is reviewed while attention is freshest; drafts whose lead has no
 * score sort last rather than being dropped.
 */
export async function loadQueue(orgId: string, bucket: ReviewBucket): Promise<QueueItem[]> {
  const drafts = await prisma.emailDraft.findMany({
    where: { clinic: { orgId }, status: { in: BUCKET_STATUSES[bucket] } },
    select: {
      clinicId: true,
      clinicName: true,
      status: true,
      confidence: true,
      wordCount: true,
      reviewWarnings: true,
      recipientEmail: true,
      version: true,
      generatedAt: true,
      clinic: {
        select: {
          category: true,
          scores: {
            take: 1,
            orderBy: { computedAt: "desc" },
            select: { overallScore: true, overrideOverall: true, manualOverride: true },
          },
        },
      },
    },
    orderBy: { generatedAt: "desc" },
    take: 500,
  });

  const items: QueueItem[] = drafts.map((d) => {
    const score = d.clinic.scores[0];
    // The effective score: a manual override is what the human decided this
    // lead is worth, so it is what the queue should rank by.
    const overall = score
      ? score.manualOverride && score.overrideOverall !== null
        ? score.overrideOverall
        : score.overallScore
      : null;

    return {
      clinicId: d.clinicId,
      clinicName: d.clinicName,
      category: d.clinic.category,
      status: d.status,
      confidence: d.confidence,
      wordCount: d.wordCount,
      warningCount: d.reviewWarnings.length,
      hasRecipient: Boolean(d.recipientEmail),
      version: d.version,
      overallScore: overall,
      generatedAt: d.generatedAt.toISOString(),
    };
  });

  return items.sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1));
}

/**
 * Leads that are ready to draft but have no draft yet.
 *
 * Drives the count on the "Generate N drafts" button, so it has to agree with
 * what the job will actually attempt. That means resolving the EFFECTIVE
 * service the same way `PrismaDraftJobRepository.loadTargets` does — a manual
 * override can both promote a lead the rules scored as None and demote one they
 * scored as actionable, and a plain `recommendedService != NONE` filter sees
 * neither. A button that promises 25 and drafts 23 is worse than no number.
 */
export async function countDraftableWithoutDraft(orgId: string): Promise<number> {
  const clinics = await prisma.clinic.findMany({
    where: { orgId, doNotContact: false, drafts: { none: {} }, scores: { some: {} } },
    select: {
      id: true,
      scores: {
        take: 1,
        orderBy: { computedAt: "desc" },
        select: {
          recommendedService: true,
          manualOverride: true,
          overrideOverall: true,
          overrideService: true,
          overallScore: true,
          confidence: true,
        },
      },
    },
  });

  return clinics.filter((c) => {
    const score = c.scores[0];
    return score ? effectiveServiceOf(score) !== RecommendedService.NONE : false;
  }).length;
}
