import {
  ActivityType,
  CampaignStatus,
  Confidence,
  ContactPublisher,
  DecisionRole,
  EmailStatus,
  JobStatus,
  LeadSource,
  PipelineStage,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { isDecisionMakerRole } from "@/lib/people/roles";
import { buildPersonFindings } from "@/lib/people/findings";
import {
  hostOf,
  normalizePersonName,
  resolveIdentity,
  type KnownPerson,
} from "@/lib/people/identity";
import { getDatabaseEncoding, sanitizeDeep, sanitizeForEncoding } from "@/lib/db/encoding";
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
    // The encoding failure hit this table too: an error whose message quoted a
    // clinic name containing CJK could not be written, so the run lost the
    // record of why it failed.
    const encoding = await getDatabaseEncoding();
    await prisma.errorLog.create({
      data: {
        jobId,
        scope: error.scope,
        targetUrl: sanitizeForEncoding(error.targetUrl ?? null, encoding),
        message: sanitizeForEncoding(error.message.slice(0, 2000), encoding),
        stack: sanitizeForEncoding(error.stack ?? null, encoding),
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
    rawResult: ClinicResearchResult,
    score: ScoreResult,
  ): Promise<"created" | "duplicate"> {
    // Fold text the server encoding cannot hold. On a WIN1252 cluster a clinic
    // whose name carries an emoji used to fail the INSERT outright (Postgres
    // 22P05) and the lead was lost; it is now saved with the symbol stripped.
    // No-op on a UTF8 database.
    const result = sanitizeDeep(rawResult, await getDatabaseEncoding());
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

        // People the clinic publishes about itself.
        //
        // A person is org-scoped, not clinic-scoped: the same physician can
        // practise at several clinics, and recognising that is the whole point
        // of affiliation mapping. Matched on the normalized name within the
        // org, which is a bounded indexed lookup, never a scan.
        //
        // Deliberately conservative: a name match alone creates an affiliation,
        // never a merge of two verified identities. Stronger resolution lands
        // in P3.1 with the CPSO record as a corroborating signal.
        const clinicHost = hostOf(result.websiteUrl);

        for (const person of result.people) {
          const normalized = normalizePersonName(person.fullName);

          // Narrow to plausible candidates before deciding: people sharing the
          // normalized name, plus anyone already holding this address. Both
          // are indexed lookups, never a scan.
          const selection = {
            id: true,
            normalizedName: true,
            contacts: { select: { email: true } },
            affiliations: { select: { clinic: { select: { websiteUrl: true } } } },
          } as const;

          const [sameName, sameEmail] = await Promise.all([
            normalized
              ? tx.person.findMany({ where: { orgId, normalizedName: normalized }, select: selection, take: 25 })
              : Promise.resolve([]),
            person.email
              ? tx.person.findMany({
                  where: { orgId, contacts: { some: { email: person.email } } },
                  select: selection,
                  take: 5,
                })
              : Promise.resolve([]),
          ]);

          const known = new Map<string, KnownPerson>();
          for (const row of [...sameEmail, ...sameName]) {
            known.set(row.id, {
              id: row.id,
              normalizedName: row.normalizedName,
              emails: row.contacts.map((c) => c.email),
              hosts: row.affiliations.map((a) => hostOf(a.clinic.websiteUrl)),
            });
          }

          // A name alone never merges two people: see lib/people/identity.ts.
          // Two records for one physician costs a duplicate row; one record for
          // two physicians sends an email about the wrong clinic.
          const match = resolveIdentity(
            { normalizedName: normalized, email: person.email, host: clinicHost },
            [...known.values()],
          );

          const personId =
            match?.personId ??
            (
              await tx.person.create({
                data: { orgId, fullName: person.fullName, normalizedName: normalized },
                select: { id: true },
              })
            ).id;

          await tx.personAffiliation.upsert({
            where: { personId_clinicId: { personId, clinicId: clinic.id } },
            create: {
              personId,
              clinicId: clinic.id,
              role: person.classification?.role ?? DecisionRole.OTHER,
              roleTitle: person.roleTitle,
              isOwner: person.classification?.isOwner ?? false,
              confidence: person.classification?.confidence ?? Confidence.WEAK_INFERENCE,
              sourceUrl: person.sourceUrl,
            },
            update: { lastSeenAt: now },
          });

          // Re-derive this person's evidence from every affiliation they now
          // hold, not just this clinic. A second clinic is what turns a
          // single-site contact into a multi-location lead, and that is only
          // visible from the whole set.
          const affiliations = await tx.personAffiliation.findMany({
            where: { personId },
            select: {
              role: true,
              roleTitle: true,
              isOwner: true,
              confidence: true,
              sourceUrl: true,
              clinic: { select: { name: true } },
            },
            take: 50,
          });

          const personFindings = buildPersonFindings(
            person.fullName,
            affiliations.map((a) => ({
              clinicName: a.clinic.name,
              role: a.role,
              roleTitle: a.roleTitle,
              isOwner: a.isOwner,
              confidence: a.confidence,
              sourceUrl: a.sourceUrl,
            })),
            person.email,
          );

          // A role can change between runs ("Optometrist" becoming "Medical
          // Director"), and the code changes with it. Without pruning, the old
          // role finding would linger and the person would score for both.
          const keep = personFindings.map((f) => f.code);
          await tx.personFinding.deleteMany({
            where: { personId, code: { notIn: keep.length > 0 ? keep : ["__none__"] } },
          });

          for (const finding of personFindings) {
            // Upsert: a person researched again through a second clinic must
            // update their evidence, never collide on (personId, code).
            await tx.personFinding.upsert({
              where: { personId_code: { personId, code: finding.code } },
              create: { personId, ...finding },
              update: {
                finding: finding.finding,
                evidence: finding.evidence,
                sourceUrl: finding.sourceUrl,
                confidence: finding.confidence,
                isFact: finding.isFact,
                collectedAt: now,
              },
            });
          }

          // Only an address the clinic actually published. Never inferred, and
          // only marked a decision-maker mailbox when the stated role says so:
          // that flag is what draft-repository.ts uses to choose a recipient.
          if (person.email) {
            await tx.contact.create({
              data: {
                clinicId: clinic.id,
                personId,
                name: person.fullName,
                jobTitle: person.roleTitle,
                email: person.email,
                emailStatus: EmailStatus.UNVERIFIED,
                isDecisionMaker: person.classification
                  ? isDecisionMakerRole(person.classification.role)
                  : false,
                publishedBy: ContactPublisher.CLINIC,
                sourceUrl: person.sourceUrl,
                collectedAt: now,
              },
            });
          }
        }

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
