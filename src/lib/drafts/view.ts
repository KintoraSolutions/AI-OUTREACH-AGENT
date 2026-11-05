import { prisma } from "@/lib/db";
import type { PersonalizationEvidenceItem } from "@/lib/ai/draft-types";
import type { DraftView, DraftVersionView } from "@/components/app/draft-panel";

/**
 * Loads one clinic's draft in the shape the draft panel expects.
 *
 * The lead detail page built this inline. The review queue needs the identical
 * object, and two hand-maintained copies of a twenty-field mapping drift — the
 * draft/approve call sites in this codebase have silently diverged once before.
 * One loader, two callers.
 */

export interface DraftScreen {
  clinicId: string;
  clinicName: string;
  category: string | null;
  doNotContact: boolean;
  draft: DraftView | null;
  versions: DraftVersionView[];
  /** Effective overall score (a manual override wins), or null if unscored. */
  overallScore: number | null;
  strategyReason: string | null;
}

export async function loadDraftScreen(
  orgId: string,
  clinicId: string,
): Promise<DraftScreen | null> {
  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId, orgId },
    select: {
      id: true,
      name: true,
      category: true,
      doNotContact: true,
      scores: {
        take: 1,
        orderBy: { computedAt: "desc" },
        select: { overallScore: true, overrideOverall: true, manualOverride: true },
      },
      drafts: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { versions: { orderBy: { version: "desc" } } },
      },
    },
  });

  if (!clinic) return null;

  const row = clinic.drafts[0];
  const score = clinic.scores[0];
  const overallScore = score
    ? score.manualOverride && score.overrideOverall !== null
      ? score.overrideOverall
      : score.overallScore
    : null;

  const draft: DraftView | null = row
    ? {
        id: row.id,
        status: row.status,
        service: row.service,
        strategyReason: row.strategyReason,
        subject: row.subject,
        body: row.body,
        confidence: row.confidence,
        reviewWarnings: row.reviewWarnings,
        blockedReason: row.blockedReason,
        wordCount: row.wordCount,
        version: row.version,
        aiModel: row.aiModel,
        aiProvider: row.aiProvider,
        promptVersion: row.promptVersion,
        recipientName: row.recipientName,
        recipientEmail: row.recipientEmail,
        generatedAt: row.generatedAt.toISOString(),
        approvedAt: row.approvedAt?.toISOString() ?? null,
        rejectedReason: row.rejectedReason,
        rejectedAt: row.rejectedAt?.toISOString() ?? null,
        evidence: (
          (row.personalizationEvidence as unknown as PersonalizationEvidenceItem[]) ?? []
        ).map((e) => ({
          code: e.code,
          claim: e.claim,
          sourceUrl: e.sourceUrl,
          category: e.category,
          confidence: e.confidence,
          isFact: e.isFact,
        })),
      }
    : null;

  const versions: DraftVersionView[] = (row?.versions ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    changeType: v.changeType,
    status: v.status,
    subject: v.subject,
    body: v.body,
    createdByName: v.createdByName,
    createdAt: v.createdAt.toISOString(),
    reason: v.reason,
  }));

  return {
    clinicId: clinic.id,
    clinicName: clinic.name,
    category: clinic.category,
    doNotContact: clinic.doNotContact,
    draft,
    versions,
    overallScore,
    strategyReason: row?.strategyReason ?? null,
  };
}
