"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CampaignStatus, JobStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OrgContext, PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { campaignCreateSchema } from "@/lib/validation/campaign";
import { isProviderConfigured } from "@/lib/env";
import { getJobRunner, RunnerNotConfiguredError, type JobRunner } from "@/lib/research/runner";

async function ctxOrError(min: Role): Promise<{ ctx: OrgContext } | { error: FormState }> {
  try {
    return { ctx: await requireRole(min) };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

async function ownedCampaign(orgId: string, campaignId: string) {
  return prisma.searchCampaign.findFirst({ where: { id: campaignId, orgId } });
}

/**
 * Resolve the job runner, returning a clear configuration error instead of
 * throwing when production background-job credentials are missing (item 4). The
 * inline runner is never used in production, so this refuses rather than
 * silently degrading.
 */
function runnerOrError(): { runner: JobRunner } | { error: FormState } {
  try {
    return { runner: getJobRunner() };
  } catch (e) {
    if (e instanceof RunnerNotConfiguredError) return { error: fail(e.message) };
    throw e;
  }
}

const ACTIVE_JOB_STATES: JobStatus[] = [JobStatus.QUEUED, JobStatus.RUNNING];

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const input = {
    name: formData.get("name"),
    categories: formData.getAll("categories"),
    city: formData.get("city"),
    region: formData.get("region"),
    country: formData.get("country"),
    radiusKm: formData.get("radiusKm"),
    minLocations: formData.get("minLocations"),
    maxLeads: formData.get("maxLeads"),
    requiredKeywords: formData.get("requiredKeywords"),
    excludedKeywords: formData.get("excludedKeywords"),
  };

  const parsed = campaignCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const d = parsed.data;

  const campaign = await prisma.searchCampaign.create({
    data: {
      orgId: ctx.orgId,
      name: d.name,
      categories: d.categories,
      city: d.city ?? null,
      region: d.region ?? null,
      country: d.country ?? null,
      radiusMeters: d.radiusKm ? Math.round(d.radiusKm * 1000) : null,
      minLocations: d.minLocations,
      maxLeads: d.maxLeads,
      requiredKeywords: d.requiredKeywords,
      excludedKeywords: d.excludedKeywords,
      status: CampaignStatus.DRAFT,
      createdById: ctx.userId,
    },
  });

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

// ---------------------------------------------------------------------------
// Run / pause / resume / cancel
// ---------------------------------------------------------------------------

export async function runCampaign(campaignId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  if (!isProviderConfigured("discovery")) {
    return fail(
      "Automated discovery is unavailable: set GOOGLE_PLACES_API_KEY to run research. You can still add leads manually or via CSV import.",
    );
  }

  const campaign = await ownedCampaign(ctx.orgId, campaignId);
  if (!campaign) return fail("Campaign not found.");
  if (campaign.status === CampaignStatus.RUNNING) return fail("This campaign is already running.");

  const active = await prisma.researchJob.findFirst({
    where: { campaignId, status: { in: ACTIVE_JOB_STATES } },
  });
  if (active) return fail("A research job for this campaign is already active.");

  const resolved = runnerOrError();
  if ("error" in resolved) return resolved.error;
  const { runner } = resolved;

  const job = await prisma.researchJob.create({
    data: {
      orgId: ctx.orgId,
      campaignId,
      type: "campaign.research",
      status: JobStatus.QUEUED,
      runnerRef: runner.name,
    },
  });
  await prisma.searchCampaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.RUNNING },
  });

  await runner.start(job.id, campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/jobs");
  return { ok: true, message: "Research started.", resourceId: job.id };
}

export async function pauseCampaign(campaignId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!(await ownedCampaign(ctx.orgId, campaignId))) return fail("Campaign not found.");

  const job = await prisma.researchJob.findFirst({
    where: { campaignId, status: { in: ACTIVE_JOB_STATES } },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return fail("No active research job to pause.");

  await prisma.researchJob.update({ where: { id: job.id }, data: { pauseRequested: true } });
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: "Pause requested; the job will stop after the current clinic." };
}

export async function resumeCampaign(campaignId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  if (!isProviderConfigured("discovery")) {
    return fail("Automated discovery is unavailable: set GOOGLE_PLACES_API_KEY to resume research.");
  }
  const campaign = await ownedCampaign(ctx.orgId, campaignId);
  if (!campaign) return fail("Campaign not found.");
  if (campaign.status !== CampaignStatus.PAUSED) return fail("This campaign is not paused.");

  // Resuming starts a fresh job; already-saved clinics are skipped by dedupe, so
  // the run continues where it left off rather than re-creating leads.
  const resolved = runnerOrError();
  if ("error" in resolved) return resolved.error;
  const { runner } = resolved;

  const job = await prisma.researchJob.create({
    data: {
      orgId: ctx.orgId,
      campaignId,
      type: "campaign.research",
      status: JobStatus.QUEUED,
      runnerRef: runner.name,
    },
  });
  await prisma.searchCampaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.RUNNING },
  });
  await runner.start(job.id, campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: "Research resumed.", resourceId: job.id };
}

export async function cancelCampaign(campaignId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  const campaign = await ownedCampaign(ctx.orgId, campaignId);
  if (!campaign) return fail("Campaign not found.");

  const job = await prisma.researchJob.findFirst({
    where: { campaignId, status: { in: ACTIVE_JOB_STATES } },
    orderBy: { createdAt: "desc" },
  });

  if (job) {
    // Signal the running pipeline; it finalizes the job as CANCELLED itself.
    await prisma.researchJob.update({ where: { id: job.id }, data: { cancelRequested: true } });
  } else {
    // No active job (e.g. paused/draft): cancel directly.
    await prisma.searchCampaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.CANCELLED },
    });
  }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/jobs");
  return { ok: true, message: "Cancellation requested." };
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const ctx = await requireRole(Role.ADMIN);
  const campaign = await ownedCampaign(ctx.orgId, campaignId);
  if (!campaign) return;
  // Leads keep their data; their campaign link is set null by the schema.
  await prisma.searchCampaign.delete({ where: { id: campaignId } });
  revalidatePath("/campaigns");
  redirect("/campaigns");
}
