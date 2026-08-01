import {
  ActivityType,
  CampaignStatus,
  EmailStatus,
  JobStatus,
  LeadSource,
  PipelineStage,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadScoringConfig } from "@/lib/scoring/config";
import type { ScoreResult, ScoringConfig } from "@/lib/scoring/types";
import type {
  CampaignRunStatus,
  ClinicResearchResult,
  JobControl,
  JobPatch,
  JobRunStatus,
  LoggedError,
  ResearchRepository,
} from "@/lib/research/types";
import { normalizeName } from "@/lib/leads/dedupe";

/**
 * Prisma-backed implementation of the research persistence boundary. All writes
 * are org-scoped. The clinic + its locations, contacts, sources, audit,
 * findings, and activity are written in a single transaction so a saved lead is
 * always internally consistent; a unique-constraint hit means a concurrent
 * duplicate and is reported as such (the DB is the dedupe backstop).
 */

const JOB_STATUS: Record<JobRunStatus, JobStatus> = {
  QUEUED: JobStatus.QUEUED,
  RUNNING: JobStatus.RUNNING,
  PAUSED: JobStatus.PAUSED,
  SUCCEEDED: JobStatus.SUCCEEDED,
  FAILED: JobStatus.FAILED,
  CANCELLED: JobStatus.CANCELLED,
  PARTIAL: JobStatus.PARTIAL,
};

const CAMPAIGN_STATUS: Record<CampaignRunStatus, CampaignStatus> = {
  DRAFT: CampaignStatus.DRAFT,
  RUNNING: CampaignStatus.RUNNING,
  PAUSED: CampaignStatus.PAUSED,
  COMPLETED: CampaignStatus.COMPLETED,
  CANCELLED: CampaignStatus.CANCELLED,
};

export class PrismaResearchRepository implements ResearchRepository {
  async loadCriteria(campaignId: string) {
    const c = await prisma.searchCampaign.findUnique({ where: { id: campaignId } });
    if (!c) return null;
    return {
      orgId: c.orgId,
      criteria: {
        categories: c.categories,
        city: c.city,
        region: c.region,
        country: c.country,
        radiusMeters: c.radiusMeters,
        minLocations: c.minLocations,
        maxLeads: c.maxLeads,
        requiredKeywords: c.requiredKeywords,
        excludedKeywords: c.excludedKeywords,
      },
    };
  }

  async existingDedupeKeys(orgId: string): Promise<Set<string>> {
    const rows = await prisma.clinic.findMany({ where: { orgId }, select: { dedupeKey: true } });
    return new Set(rows.map((r) => r.dedupeKey));
  }

  async loadScoringConfig(orgId: string): Promise<ScoringConfig> {
    return loadScoringConfig(orgId);
  }

  async readControl(jobId: string): Promise<JobControl> {
    const job = await prisma.researchJob.findUnique({
      where: { id: jobId },
      select: { cancelRequested: true, pauseRequested: true },
    });
    return {
      cancelRequested: job?.cancelRequested ?? false,
      pauseRequested: job?.pauseRequested ?? false,
    };
  }

  async updateJob(jobId: string, patch: JobPatch): Promise<void> {
    const data: Prisma.ResearchJobUpdateInput = {};
    if (patch.status) data.status = JOB_STATUS[patch.status];
    if (patch.total !== undefined) data.total = patch.total;
    if (patch.processed !== undefined) data.processed = patch.processed;
    if (patch.succeeded !== undefined) data.succeeded = patch.succeeded;
    if (patch.failed !== undefined) data.failed = patch.failed;
    if (patch.progress !== undefined) data.progress = patch.progress;
    if (patch.message !== undefined) data.message = patch.message;
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
    // Clear the pause flag once the job actually enters the paused state.
    if (patch.status === "PAUSED") data.pauseRequested = false;
    await prisma.researchJob.update({ where: { id: jobId }, data });
  }

  async logError(jobId: string, error: LoggedError): Promise<void> {
    await prisma.errorLog.create({
      data: {
        jobId,
        scope: error.scope,
        targetUrl: error.targetUrl ?? null,
        message: error.message.slice(0, 2000),
        stack: error.stack ?? null,
        retryable: error.retryable,
      },
    });
  }

  async setCampaignStatus(campaignId: string, status: CampaignRunStatus): Promise<void> {
    await prisma.searchCampaign.update({
      where: { id: campaignId },
      data: { status: CAMPAIGN_STATUS[status] },
    });
  }

  async saveClinic(
    orgId: string,
    campaignId: string,
    result: ClinicResearchResult,
    score: ScoreResult,
  ): Promise<"created" | "duplicate"> {
    const now = new Date();
    // The clinic, its audit + findings, and its score are written in ONE
    // transaction. Duplicate prevention (the unique dedupeKey) rolls the whole
    // transaction back on a concurrent/retried save, so no partial or duplicate
    // findings or scores can be created.
    const siteFetched = result.sources.some((s) => s.type === "website");
    // Defensive dedupe by code (the audit never emits duplicates, but the
    // (auditId, code) unique constraint must never be violated inside the tx).
    const findingsByCode = new Map(result.findings.map((f) => [f.code, f]));

    try {
      await prisma.$transaction(async (tx) => {
        const clinic = await tx.clinic.create({
          data: {
            orgId,
            campaignId,
            name: result.candidate.name,
            category: result.candidate.category,
            websiteUrl: result.websiteUrl,
            mainPhone: result.mainPhone,
            publicEmail: result.publicEmail,
            contactPageUrl: result.contactPageUrl,
            bookingMethod: result.bookingMethod,
            onlineBookingUrl: result.onlineBookingUrl,
            socialLinks:
              Object.keys(result.socialLinks).length > 0 ? result.socialLinks : Prisma.JsonNull,
            websiteTech: result.websiteTech,
            locationCount: result.locationCount,
            dedupeKey: result.dedupeKey,
            normalizedName: normalizeName(result.candidate.name),
            leadSource: LeadSource.RESEARCH,
            stage: PipelineStage.DISCOVERED,
            collectedAt: now,
            lastResearchedAt: now,
            lastAuditedAt: now,
            locations: {
              create: result.locations.map((l) => ({
                label: l.label,
                address: l.address,
                phone: l.phone,
                sourceUrl: result.websiteUrl,
                collectedAt: now,
              })),
            },
            contacts: result.publicEmail
              ? {
                  create: [
                    {
                      email: result.publicEmail,
                      emailStatus: EmailStatus.UNVERIFIED,
                      phone: result.mainPhone,
                      sourceUrl: result.contactPageUrl ?? result.websiteUrl,
                      collectedAt: now,
                    },
                  ],
                }
              : undefined,
            sources: {
              create: result.sources.map((s) => ({
                url: s.url,
                type: s.type,
                notes: s.notes ?? null,
                retrievedAt: now,
              })),
            },
            activities: {
              create: [
                {
                  type: ActivityType.RESEARCH_COMPLETED,
                  note: `Researched via campaign. ${result.findings.length} finding(s), ${result.sources.length} source(s). Score ${score.overallScore}/100 (${score.recommendedService}).`,
                  metadata: { campaignId, rulesetVersion: score.rulesetVersion },
                },
              ],
            },
          },
        });

        await tx.websiteAudit.create({
          data: {
            clinicId: clinic.id,
            url: result.websiteUrl ?? result.candidate.sourceUrl,
            performanceScore: result.audit?.performanceScore ?? null,
            lcpMs: result.audit?.lcpMs ?? null,
            cls: result.audit?.cls ?? null,
            mobileFriendly: result.audit?.mobileFriendly ?? null,
            httpsValid: result.websiteUrl ? result.websiteUrl.startsWith("https://") : null,
            status: siteFetched ? "completed" : "partial",
            checkedAt: now,
            findings: {
              create: [...findingsByCode.values()].map((f) => ({
                category: f.category,
                code: f.code,
                ruleVersion: score.rulesetVersion,
                finding: f.finding,
                evidence: f.evidence,
                sourceUrl: f.sourceUrl,
                subarea: f.subarea ?? null,
                confidence: f.confidence,
                isFact: f.isFact,
                scoreContribution: score.contributionByCode[f.code] ?? 0,
                checkedAt: now,
              })),
            },
          },
        });

        await tx.leadScore.create({
          data: {
            clinicId: clinic.id,
            websiteScore: score.websiteScore,
            softwareScore: score.softwareScore,
            klearqScore: score.klearqScore,
            contactabilityScore: score.contactabilityScore,
            businessFitScore: score.businessFitScore,
            overallScore: score.overallScore,
            recommendedService: score.recommendedService,
            recommendationReason: score.recommendationReason,
            confidence: score.confidence,
            breakdown: score.breakdown as unknown as Prisma.InputJsonValue,
            weightsVersion: score.rulesetVersion,
            computedAt: now,
          },
        });
      });
      return "created";
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return "duplicate";
      }
      throw e;
    }
  }
}
