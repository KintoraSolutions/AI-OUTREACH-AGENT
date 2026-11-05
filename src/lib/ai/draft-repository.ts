import { ActivityType, DraftStatus, Prisma, RecommendedService } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAiProvider } from "@/lib/ai/provider";
import { generateDraft } from "@/lib/ai/draft";
import { loadEmailVoice, type EmailVoice } from "@/lib/ai/email-voice";
import { loadCompanyProfile, type CompanyProfile } from "@/lib/ai/company-profile";
import { loadOrgAiProfile, type OrgAiProfile } from "@/lib/ai/org-ai-profile";
import { effectiveServiceOf } from "@/lib/leads/score-filter";
import { PrismaResearchRepository } from "@/lib/research/repository";
import type { AiProvider } from "@/lib/ai/types";
import type {
  DraftClinic,
  DraftFinding,
  DraftResult,
  DraftScoreSummary,
  OrgIdentity,
  OutreachStrategy,
} from "@/lib/ai/draft-types";
import type { DraftJobRepository, DraftOutcome } from "@/lib/ai/bulk-draft";
import type { JobControl, JobPatch, LoggedError } from "@/lib/research/types";

/**
 * Prisma persistence for evidence-grounded drafts. Central rules:
 *  - one current EmailDraft per clinic (unique clinicId); regeneration bumps the
 *    version and snapshots the prior content into DraftVersion, so retries never
 *    create duplicate drafts;
 *  - every meaningful change (generate/regenerate/edit/approve/reject/restore)
 *    writes an immutable DraftVersion snapshot for history, comparison, restore,
 *    and the approval record (final content + evidence set + user + timestamp);
 *  - every change writes an OutreachActivity entry.
 */

export interface DraftActor {
  id: string | null;
  name: string | null;
}

export interface DraftContext {
  contactId: string | null;
  clinic: DraftClinic;
  org: OrgIdentity;
  score: DraftScoreSummary;
  findings: DraftFinding[];
  voice: EmailVoice;
  profile: CompanyProfile;
  aiProfile: OrgAiProfile;
}

export const jsonOrNull = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

const serviceToStrategy = (s: RecommendedService): OutreachStrategy =>
  s === RecommendedService.NONE ? "INSUFFICIENT" : (s as OutreachStrategy);

/** Load everything the drafting engine needs for one clinic. */
export async function loadDraftContext(
  orgId: string,
  clinicId: string,
): Promise<DraftContext | null> {
  const [clinic, voice, profile, aiProfile] = await Promise.all([
    prisma.clinic.findFirst({
      where: { id: clinicId, orgId },
      include: {
        organization: true,
        contacts: { orderBy: { isDecisionMaker: "desc" } },
        scores: { take: 1, orderBy: { computedAt: "desc" } },
        audits: { take: 1, orderBy: { checkedAt: "desc" }, include: { findings: true } },
      },
    }),
    loadEmailVoice(orgId),
    loadCompanyProfile(orgId),
    loadOrgAiProfile(orgId),
  ]);
  if (!clinic) return null;

  const org = clinic.organization;
  const contact = clinic.contacts.find((c) => c.isDecisionMaker) ?? clinic.contacts[0] ?? null;
  const scoreRow = clinic.scores[0];

  const draftClinic: DraftClinic = {
    name: clinic.name,
    recipientName: contact?.name ?? null,
    recipientEmail: contact?.email ?? clinic.publicEmail ?? null,
  };

  const orgIdentity: OrgIdentity = {
    companyName: org.companyName,
    portfolioUrl: org.portfolioUrl,
    contactUrl: org.contactUrl,
    senderName: org.senderName,
    senderEmail: org.senderEmail,
  };

  const score: DraftScoreSummary = scoreRow
    ? {
        effectiveService: effectiveServiceOf(scoreRow),
        computedService: scoreRow.recommendedService,
        confidence: scoreRow.confidence,
        websiteScore: scoreRow.websiteScore,
        softwareScore: scoreRow.softwareScore,
        klearqScore: scoreRow.klearqScore,
        manualOverride: scoreRow.manualOverride,
      }
    : {
        effectiveService: RecommendedService.NONE,
        computedService: RecommendedService.NONE,
        confidence: "LOW",
        websiteScore: 0,
        softwareScore: 0,
        klearqScore: 0,
        manualOverride: false,
      };

  const findings: DraftFinding[] = (clinic.audits[0]?.findings ?? []).map((f) => ({
    id: f.id,
    code: f.code,
    category: f.category,
    finding: f.finding,
    evidence: f.evidence,
    sourceUrl: f.sourceUrl,
    confidence: f.confidence,
    isFact: f.isFact,
    dismissed: f.dismissed,
  }));

  return {
    contactId: contact?.id ?? null,
    clinic: draftClinic,
    org: orgIdentity,
    score,
    findings,
    voice,
    profile,
    aiProfile,
  };
}

/**
 * Upsert the current draft for a clinic from an engine result, bumping the
 * version and writing an immutable snapshot. Regeneration clears any prior
 * approval/rejection because the content is new.
 */
export async function persistDraftResult(
  ctx: { clinicId: string; contactId: string | null; clinic: DraftClinic; clinicName: string },
  result: DraftResult,
  actor: DraftActor,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const now = new Date();
  const existing = await client.emailDraft.findUnique({ where: { clinicId: ctx.clinicId } });
  const version = existing ? existing.version + 1 : 1;
  const changeType = existing ? "regenerated" : "generated";

  const data = {
    contactId: ctx.contactId,
    clinicName: ctx.clinicName,
    service: result.service,
    strategyReason: result.strategyReason,
    subject: result.subject,
    recipientName: ctx.clinic.recipientName,
    recipientEmail: ctx.clinic.recipientEmail,
    body: result.body,
    personalizationEvidence: jsonOrNull(result.personalizationEvidence),
    claimMap: jsonOrNull(result.claimMap),
    evidenceFindingIds: result.evidenceFindingIds,
    evidenceSourceUrls: result.evidenceSourceUrls,
    confidence: result.confidence,
    reviewWarnings: result.reviewWarnings,
    wordCount: result.wordCount,
    status: result.status as DraftStatus,
    blockedReason: result.blockedReason,
    version,
    aiModel: result.aiModel,
    aiProvider: result.aiProvider,
    promptVersion: result.promptVersion,
    generatedAt: now,
    editedBody: null,
    approvedById: null,
    approvedAt: null,
    rejectedById: null,
    rejectedAt: null,
    rejectedReason: null,
  };

  const draft = await client.emailDraft.upsert({
    where: { clinicId: ctx.clinicId },
    create: { clinicId: ctx.clinicId, createdById: actor.id, ...data },
    update: data,
  });

  await client.draftVersion.create({
    data: {
      draftId: draft.id,
      version,
      service: result.service,
      subject: result.subject,
      body: result.body,
      confidence: result.confidence,
      reviewWarnings: result.reviewWarnings,
      personalizationEvidence: jsonOrNull(result.personalizationEvidence),
      claimMap: jsonOrNull(result.claimMap),
      status: result.status as DraftStatus,
      aiModel: result.aiModel,
      aiProvider: result.aiProvider,
      promptVersion: result.promptVersion,
      changeType,
      createdById: actor.id,
      createdByName: actor.name,
    },
  });

  await client.outreachActivity.create({
    data: {
      clinicId: ctx.clinicId,
      type: ActivityType.DRAFT_GENERATED,
      actorId: actor.id,
      actorName: actor.name,
      note:
        result.status === "BLOCKED"
          ? `Draft blocked: ${result.blockedReason ?? "insufficient evidence"}`
          : `Draft generated (${result.service}, v${version}).`,
      metadata: { version, status: result.status, service: result.service },
    },
  });

  return draft;
}

type DraftRow = Prisma.EmailDraftGetPayload<Record<string, never>>;

/**
 * Apply a non-generation transition (edit/approve/reject/restore): update the
 * draft, bump the version, and write an immutable snapshot with the given
 * changeType + reason.
 */
export async function transitionDraft(
  draft: DraftRow,
  patch: Prisma.EmailDraftUpdateInput,
  changeType: string,
  actor: DraftActor,
  reason: string | null,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const version = draft.version + 1;
  const updated = await client.emailDraft.update({
    where: { id: draft.id },
    data: { ...patch, version },
  });
  await client.draftVersion.create({
    data: {
      draftId: draft.id,
      version,
      service: updated.service,
      subject: updated.subject,
      body: updated.body,
      confidence: updated.confidence,
      reviewWarnings: updated.reviewWarnings,
      personalizationEvidence: jsonOrNull(updated.personalizationEvidence),
      claimMap: jsonOrNull(updated.claimMap),
      status: updated.status,
      aiModel: updated.aiModel,
      aiProvider: updated.aiProvider,
      promptVersion: updated.promptVersion,
      changeType,
      reason,
      createdById: actor.id,
      createdByName: actor.name,
    },
  });
  return updated;
}

export { serviceToStrategy };

/** Load context, generate a draft, and persist it. Used by single + bulk paths. */
export async function draftAndSaveClinic(
  orgId: string,
  clinicId: string,
  provider: AiProvider,
  actor: DraftActor,
): Promise<{ outcome: DraftOutcome; result: DraftResult | null }> {
  const context = await loadDraftContext(orgId, clinicId);
  if (!context) return { outcome: "failed", result: null };

  const result = await generateDraft({
    clinic: context.clinic,
    org: context.org,
    score: context.score,
    findings: context.findings,
    provider,
    voice: context.voice,
    profile: context.profile,
    aiProfile: context.aiProfile,
  });

  await persistDraftResult(
    { clinicId, contactId: context.contactId, clinic: context.clinic, clinicName: context.clinic.name },
    result,
    actor,
  );

  return { outcome: result.status === "BLOCKED" ? "blocked" : "generated", result };
}

// ---------------------------------------------------------------------------
// Bulk drafting job repository (durable pipeline persistence boundary)
// ---------------------------------------------------------------------------

export class PrismaDraftJobRepository implements DraftJobRepository {
  private readonly jobs = new PrismaResearchRepository();

  constructor(private readonly provider: AiProvider = getAiProvider()) {}

  async loadTargets(jobId: string): Promise<{ orgId: string; clinicIds: string[] } | null> {
    const job = await prisma.researchJob.findUnique({ where: { id: jobId } });
    if (!job) return null;

    // A job with no campaign is an org-wide "fill in what is missing" run: it
    // targets every qualified lead that has no draft at all, so it stays safe
    // to re-run as a campaign keeps discovering clinics.
    const orgWide = job.campaignId === null;

    // Qualified leads: scored, an effective service other than NONE, contactable.
    const clinics = await prisma.clinic.findMany({
      where: {
        orgId: job.orgId,
        ...(orgWide ? {} : { campaignId: job.campaignId }),
        doNotContact: false,
        scores: { some: {} },
        ...(orgWide
          ? { drafts: { none: {} } }
          : // Never overwrite a human approval. persistDraftResult upserts by
            // clinicId and resets the status, so without this guard a second
            // campaign run would silently discard every approved draft in it.
            { drafts: { none: { status: DraftStatus.APPROVED } } }),
      },
      // Select only what effectiveServiceOf needs; avoid loading the large
      // LeadScore.breakdown JSON for every clinic in the campaign.
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
      orderBy: { createdAt: "asc" },
    });

    const clinicIds = clinics
      .filter((c) => {
        const s = c.scores[0];
        return s ? effectiveServiceOf(s) !== RecommendedService.NONE : false;
      })
      .map((c) => c.id);

    return { orgId: job.orgId, clinicIds };
  }

  readControl(jobId: string): Promise<JobControl> {
    return this.jobs.readControl(jobId);
  }

  updateJob(jobId: string, patch: JobPatch): Promise<void> {
    return this.jobs.updateJob(jobId, patch);
  }

  logError(jobId: string, error: LoggedError): Promise<void> {
    return this.jobs.logError(jobId, error);
  }

  async draftClinic(orgId: string, clinicId: string): Promise<DraftOutcome> {
    const { outcome } = await draftAndSaveClinic(orgId, clinicId, this.provider, {
      id: null,
      name: "Bulk drafting",
    });
    return outcome;
  }
}
