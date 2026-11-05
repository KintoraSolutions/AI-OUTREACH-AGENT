"use server";

import { revalidatePath } from "next/cache";
import { AuditLogAction, Confidence, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OrgContext, PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { loadScoringConfig, loadScoringOverrides, SCORING_SETTING_KEY, scoringOverridesSchema } from "@/lib/scoring/config";
import { recomputeClinicScore } from "@/lib/scoring/rescore";
import { logAuditEntry } from "@/lib/audit-log";
import { manualFindingSchema, reasonSchema, scoreOverrideSchema } from "@/lib/validation/scoring";

async function ctxOrError(min: Role): Promise<{ ctx: OrgContext } | { error: FormState }> {
  try {
    return { ctx: await requireRole(min) };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

/** Load a finding scoped to the caller's org, with its clinic id. */
async function ownedFinding(orgId: string, findingId: string) {
  return prisma.auditFinding.findFirst({
    where: { id: findingId, audit: { clinic: { orgId } } },
    include: { audit: { select: { clinicId: true } } },
  });
}

async function ownedClinic(orgId: string, clinicId: string) {
  return prisma.clinic.findFirst({ where: { id: clinicId, orgId } });
}

function revalidateClinic(clinicId: string) {
  revalidatePath(`/leads/${clinicId}`);
  revalidatePath("/leads");
}

// ---------------------------------------------------------------------------
// Recalculate
// ---------------------------------------------------------------------------

export async function recalculateClinicScore(clinicId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!(await ownedClinic(ctx.orgId, clinicId))) return fail("Lead not found.");

  const config = await loadScoringConfig(ctx.orgId);
  await prisma.$transaction(async (tx) => {
    const score = await recomputeClinicScore(clinicId, config, tx);
    await logAuditEntry({
      orgId: ctx.orgId,
      clinicId,
      action: AuditLogAction.SCORE_RECALCULATED,
      entityType: "score",
      newValue: { overallScore: score.overallScore, rulesetVersion: score.rulesetVersion },
      reason: "Manual recalculation.",
      actorId: ctx.userId,
      actorName: ctx.userName,
      tx,
    });
  });

  revalidateClinic(clinicId);
  return { ok: true, message: "Score recalculated." };
}

// ---------------------------------------------------------------------------
// Dismiss / restore findings
// ---------------------------------------------------------------------------

async function setFindingDismissed(
  findingId: string,
  dismissed: boolean,
  reason: string,
): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return fail("A reason is required.");

  const finding = await ownedFinding(ctx.orgId, findingId);
  if (!finding) return fail("Finding not found.");
  const clinicId = finding.audit.clinicId;

  const config = await loadScoringConfig(ctx.orgId);
  await prisma.$transaction(async (tx) => {
    await tx.auditFinding.update({
      where: { id: findingId },
      data: {
        dismissed,
        dismissedReason: dismissed ? parsed.data.reason : null,
        dismissedById: dismissed ? ctx.userId : null,
        dismissedAt: dismissed ? new Date() : null,
      },
    });
    await recomputeClinicScore(clinicId, config, tx);
    await logAuditEntry({
      orgId: ctx.orgId,
      clinicId,
      action: dismissed ? AuditLogAction.FINDING_DISMISSED : AuditLogAction.FINDING_RESTORED,
      entityType: "finding",
      entityId: findingId,
      previousValue: { dismissed: !dismissed, code: finding.code },
      newValue: { dismissed, code: finding.code },
      reason: parsed.data.reason,
      actorId: ctx.userId,
      actorName: ctx.userName,
      tx,
    });
  });

  revalidateClinic(clinicId);
  return { ok: true, message: dismissed ? "Finding dismissed." : "Finding restored." };
}

export async function dismissFinding(findingId: string, reason: string): Promise<FormState> {
  return setFindingDismissed(findingId, true, reason);
}
export async function restoreFinding(findingId: string, reason: string): Promise<FormState> {
  return setFindingDismissed(findingId, false, reason);
}

// ---------------------------------------------------------------------------
// Add a manual finding
// ---------------------------------------------------------------------------

export async function addManualFinding(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const clinicId = String(formData.get("clinicId") ?? "");
  const clinic = await ownedClinic(ctx.orgId, clinicId);
  if (!clinic) return fail("Lead not found.");

  const parsed = manualFindingSchema.safeParse({
    category: formData.get("category"),
    finding: formData.get("finding"),
    evidence: formData.get("evidence"),
    sourceUrl: formData.get("sourceUrl"),
    confidence: formData.get("confidence"),
    points: formData.get("points"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const d = parsed.data;
  const config = await loadScoringConfig(ctx.orgId);
  const code = `manual:${crypto.randomUUID()}`;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const audit =
      (await tx.websiteAudit.findFirst({ where: { clinicId } })) ??
      (await tx.websiteAudit.create({
        data: { clinicId, url: clinic.websiteUrl ?? "manual-entry", status: "completed", checkedAt: now },
      }));

    await tx.auditFinding.create({
      data: {
        auditId: audit.id,
        category: d.category,
        code,
        ruleVersion: config.version,
        finding: d.finding,
        evidence: d.evidence,
        sourceUrl: d.sourceUrl ?? clinic.websiteUrl ?? "manual-entry",
        confidence: d.confidence,
        isFact: d.confidence === Confidence.VERIFIED,
        manual: true,
        manualPoints: d.points,
        createdById: ctx.userId,
        checkedAt: now,
      },
    });

    await recomputeClinicScore(clinicId, config, tx);
    await logAuditEntry({
      orgId: ctx.orgId,
      clinicId,
      action: AuditLogAction.FINDING_ADDED,
      entityType: "finding",
      entityId: code,
      newValue: { category: d.category, points: d.points, confidence: d.confidence, finding: d.finding },
      reason: d.reason,
      actorId: ctx.userId,
      actorName: ctx.userName,
      tx,
    });
  });

  revalidateClinic(clinicId);
  return { ok: true, message: "Manual finding added." };
}

// ---------------------------------------------------------------------------
// Override / clear the score or recommendation
// ---------------------------------------------------------------------------

export async function overrideScore(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const clinicId = String(formData.get("clinicId") ?? "");
  if (!(await ownedClinic(ctx.orgId, clinicId))) return fail("Lead not found.");

  const parsed = scoreOverrideSchema.safeParse({
    overrideOverall: formData.get("overrideOverall"),
    overrideService: formData.get("overrideService"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const d = parsed.data;

  const current = await prisma.leadScore.findUnique({ where: { clinicId } });
  if (!current) return fail("This lead has not been scored yet, so there is nothing to override.");

  await prisma.$transaction(async (tx) => {
    await tx.leadScore.update({
      where: { clinicId },
      data: {
        manualOverride: true,
        overrideOverall: d.overrideOverall ?? null,
        overrideService: d.overrideService ?? null,
        overrideReason: d.reason,
        overrideById: ctx.userId,
        overrideAt: new Date(),
      },
    });
    await logAuditEntry({
      orgId: ctx.orgId,
      clinicId,
      action: AuditLogAction.SCORE_OVERRIDDEN,
      entityType: "score",
      previousValue: {
        manualOverride: current.manualOverride,
        overrideOverall: current.overrideOverall,
        overrideService: current.overrideService,
        computedOverall: current.overallScore,
      },
      newValue: { overrideOverall: d.overrideOverall ?? null, overrideService: d.overrideService ?? null },
      reason: d.reason,
      actorId: ctx.userId,
      actorName: ctx.userName,
      tx,
    });
  });

  revalidateClinic(clinicId);
  return { ok: true, message: "Override applied." };
}

export async function clearScoreOverride(clinicId: string, reason: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return fail("A reason is required.");
  const current = await prisma.leadScore.findFirst({ where: { clinicId, clinic: { orgId: ctx.orgId } } });
  if (!current) return fail("No score found.");
  if (!current.manualOverride) return fail("There is no active override to clear.");

  await prisma.$transaction(async (tx) => {
    await tx.leadScore.update({
      where: { clinicId },
      data: {
        manualOverride: false,
        overrideOverall: null,
        overrideService: null,
        overrideReason: null,
        overrideById: null,
        overrideAt: null,
      },
    });
    await logAuditEntry({
      orgId: ctx.orgId,
      clinicId,
      action: AuditLogAction.SCORE_OVERRIDE_CLEARED,
      entityType: "score",
      previousValue: { overrideOverall: current.overrideOverall, overrideService: current.overrideService },
      reason: parsed.data.reason,
      actorId: ctx.userId,
      actorName: ctx.userName,
      tx,
    });
  });

  revalidateClinic(clinicId);
  return { ok: true, message: "Override cleared." };
}

// ---------------------------------------------------------------------------
// Scoring rules editor + campaign rescore
// ---------------------------------------------------------------------------

export async function updateScoringRules(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return fail("A reason for the change is required.");

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("config") ?? "{}"));
  } catch {
    return fail("Invalid configuration payload.");
  }
  const parsed = scoringOverridesSchema.safeParse(payload);
  if (!parsed.success) return fail("Some scoring values are out of range. Check caps, weights, and multipliers.");

  const previous = await loadScoringOverrides(ctx.orgId);
  const next = { ...parsed.data, revision: previous.revision + 1 };

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { orgId_key: { orgId: ctx.orgId, key: SCORING_SETTING_KEY } },
      create: { orgId: ctx.orgId, key: SCORING_SETTING_KEY, value: next },
      update: { value: next },
    });
    await logAuditEntry({
      orgId: ctx.orgId,
      action: AuditLogAction.SCORING_RULES_UPDATED,
      entityType: "scoring_rules",
      previousValue: previous,
      newValue: next,
      reason,
      actorId: ctx.userId,
      actorName: ctx.userName,
      tx,
    });
  });

  revalidatePath("/settings");
  return { ok: true, message: `Scoring rules saved (revision ${next.revision}). Recalculate leads to apply.` };
}

export async function rescoreCampaign(campaignId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const campaign = await prisma.searchCampaign.findFirst({ where: { id: campaignId, orgId: ctx.orgId } });
  if (!campaign) return fail("Campaign not found.");

  const config = await loadScoringConfig(ctx.orgId);
  const clinics = await prisma.clinic.findMany({ where: { campaignId, orgId: ctx.orgId }, select: { id: true } });

  // Each clinic's recompute is independent (distinct clinicId, no shared
  // transaction), so process them in bounded-concurrency chunks instead of one
  // at a time. This cuts wall-clock roughly by the chunk size and removes the
  // request-timeout risk on large campaigns, while keeping total in-flight
  // queries within the Prisma connection pool. Results are deterministic —
  // parallelism only reorders independent writes.
  const RESCORE_CONCURRENCY = 5;
  for (let i = 0; i < clinics.length; i += RESCORE_CONCURRENCY) {
    const chunk = clinics.slice(i, i + RESCORE_CONCURRENCY);
    await Promise.all(chunk.map((c) => recomputeClinicScore(c.id, config)));
  }
  await logAuditEntry({
    orgId: ctx.orgId,
    action: AuditLogAction.SCORE_RECALCULATED,
    entityType: "score",
    newValue: { campaignId, clinics: clinics.length, rulesetVersion: config.version },
    reason: "Campaign rescored after a rules change.",
    actorId: ctx.userId,
    actorName: ctx.userName,
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/leads");
  return { ok: true, message: `Recalculated ${clinics.length} lead(s).` };
}
