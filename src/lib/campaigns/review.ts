import { CampaignStatus, JobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isProviderConfigured } from "@/lib/env";
import { getUsableConnection } from "@/lib/integrations/google-connections";
import { loadCompanyProfile, type CompanyProfile } from "@/lib/ai/company-profile";
import { loadEmailVoice, type EmailVoice } from "@/lib/ai/email-voice";
import { describeAiProvider } from "@/lib/ai/provider";
import { loadDraftContext } from "@/lib/ai/draft-repository";
import { previewDraftPrompt, DRAFT_MAX_OUTPUT_TOKENS } from "@/lib/ai/draft";
import {
  buildConfigChecks,
  buildReadiness,
  classifyLead,
  type CampaignReadiness,
  type ConfigCheck,
  type ReadinessClinic,
} from "@/lib/campaigns/readiness";
import {
  estimateDraftingCost,
  estimateResearchCost,
  type CampaignCostEstimate,
  type ResearchCostEstimate,
} from "@/lib/campaigns/cost";

/**
 * Everything the pre-launch review screen needs, in one load.
 *
 * The point of this screen is that nobody should have to go hunting across
 * Leads, Settings and the jobs list to find out whether a campaign is ready. So
 * this assembles the lead-level issues, the campaign-wide configuration, and a
 * costed estimate of the run together.
 */

/** Draftable leads whose real prompts are measured for the cost estimate. */
const COST_SAMPLE_SIZE = 5;

export interface CampaignSender {
  orgName: string;
  companyName: string | null;
  senderName: string | null;
  senderEmail: string | null;
  portfolioUrl: string | null;
  contactUrl: string | null;
}

export interface CampaignReviewData {
  campaign: {
    id: string;
    name: string;
    status: CampaignStatus;
    categories: string[];
    location: string;
    radiusKm: number | null;
    maxLeads: number;
    minLocations: number;
    requiredKeywords: string[];
    excludedKeywords: string[];
  };
  sender: CampaignSender;
  profile: CompanyProfile;
  voice: EmailVoice;
  readiness: CampaignReadiness;
  checks: ConfigCheck[];
  cost: CampaignCostEstimate;
  /** What a fresh discovery run would cost in Places lookups. */
  researchCost: ResearchCostEstimate;
  /** True when a research or drafting job is already in flight. */
  hasActiveJob: boolean;
  aiConfigured: boolean;
  discoveryConfigured: boolean;
  gmailConnected: boolean;
  /** Leads already drafted, so a re-run can say what it will and will not redo. */
  alreadyDrafted: number;
  approvedDrafts: number;
}

export async function loadCampaignReview(
  orgId: string,
  userId: string,
  campaignId: string,
): Promise<CampaignReviewData | null> {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: campaignId, orgId },
  });
  if (!campaign) return null;

  const [org, profile, voice, clinics, activeJob, gmail] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    loadCompanyProfile(orgId),
    loadEmailVoice(orgId),
    prisma.clinic.findMany({
      where: { campaignId, orgId },
      select: {
        id: true,
        name: true,
        category: true,
        websiteUrl: true,
        publicEmail: true,
        doNotContact: true,
        contacts: {
          select: { email: true },
          orderBy: { isDecisionMaker: "desc" },
        },
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
        drafts: { select: { status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.researchJob.findFirst({
      where: { campaignId, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
      select: { id: true },
    }),
    isProviderConfigured("google_integrations")
      ? getUsableConnection(orgId, userId, "gmail")
      : Promise.resolve(null),
  ]);

  if (!org) return null;

  const readinessLeads: ReadinessClinic[] = clinics.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    websiteUrl: c.websiteUrl,
    publicEmail: c.publicEmail,
    doNotContact: c.doNotContact,
    contactEmails: c.contacts.map((x) => x.email),
    score: c.scores[0] ?? null,
    draft: c.drafts[0] ?? null,
  }));

  const readiness = buildReadiness(readinessLeads);
  const ai = describeAiProvider();
  const aiConfigured = ai.configured;

  const checks = buildConfigChecks({
    companyName: org.companyName,
    senderName: org.senderName,
    senderEmail: org.senderEmail,
    hasCompanyProfile: hasUsableProfile(profile),
    aiConfigured,
    gmailConnected: gmail != null,
  });

  // Only leads that will actually get a model call are costed.
  const draftableIds = readinessLeads.filter((l) => classifyLead(l).draftable).map((l) => l.id);
  const cost = await estimateCampaignCost(orgId, draftableIds, ai.model);

  const location = [campaign.city, campaign.region, campaign.country].filter(Boolean).join(", ");

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      categories: campaign.categories,
      location,
      radiusKm: campaign.radiusMeters ? Math.round(campaign.radiusMeters / 1000) : null,
      maxLeads: campaign.maxLeads,
      minLocations: campaign.minLocations,
      requiredKeywords: campaign.requiredKeywords,
      excludedKeywords: campaign.excludedKeywords,
    },
    sender: {
      orgName: org.name,
      companyName: org.companyName,
      senderName: org.senderName,
      senderEmail: org.senderEmail,
      portfolioUrl: org.portfolioUrl,
      contactUrl: org.contactUrl,
    },
    profile,
    voice,
    readiness,
    checks,
    cost,
    researchCost: estimateResearchCost(campaign.categories.length, campaign.maxLeads),
    hasActiveJob: activeJob != null,
    aiConfigured,
    discoveryConfigured: isProviderConfigured("discovery"),
    gmailConnected: gmail != null,
    alreadyDrafted: clinics.filter((c) => c.drafts.length > 0).length,
    approvedDrafts: clinics.filter((c) => c.drafts[0]?.status === "APPROVED").length,
  };
}

/** A profile is usable once it says what the company does or what it sells. */
export function hasUsableProfile(profile: CompanyProfile): boolean {
  return Boolean(profile.companyDescription?.trim() || profile.offer?.trim());
}

/**
 * Cost the run by building the prompts it would actually send.
 *
 * A sample rather than every lead: prompt size is dominated by the org's own
 * configuration (system prompt, company profile, voice, guardrails), which is
 * identical for every draft, so a handful of real prompts gives a stable mean
 * without loading findings for hundreds of clinics on a page render.
 */
async function estimateCampaignCost(
  orgId: string,
  draftableIds: string[],
  model: string,
): Promise<CampaignCostEstimate> {
  if (draftableIds.length === 0) {
    return estimateDraftingCost({
      leadCount: 0,
      model,
      avgPromptChars: 0,
      maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
    });
  }

  const sampleIds = draftableIds.slice(0, COST_SAMPLE_SIZE);
  const contexts = await Promise.all(sampleIds.map((id) => loadDraftContext(orgId, id)));

  const sizes: number[] = [];
  for (const ctx of contexts) {
    if (!ctx) continue;
    const preview = previewDraftPrompt({
      clinic: ctx.clinic,
      org: ctx.org,
      score: ctx.score,
      findings: ctx.findings,
      voice: ctx.voice,
      profile: ctx.profile,
      aiProfile: ctx.aiProfile,
    });
    // A null preview means the draft would be blocked before any model call, so
    // it costs nothing and must not drag the mean down either.
    if (preview) sizes.push(preview.system.length + preview.prompt.length);
  }

  const avgPromptChars =
    sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0;

  return estimateDraftingCost({
    leadCount: draftableIds.length,
    model,
    avgPromptChars,
    maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
  });
}
