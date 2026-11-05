"use server";

import { revalidatePath } from "next/cache";
import { ActivityType, DraftStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OrgContext, PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { getAiProvider } from "@/lib/ai/provider";
import { generateDraft } from "@/lib/ai/draft";
import { AiGenerationError, AiNotConfiguredError } from "@/lib/ai/errors";
import {
  jsonOrNull,
  loadDraftContext,
  persistDraftResult,
  transitionDraft,
} from "@/lib/ai/draft-repository";
import { scanContent } from "@/lib/ai/draft-guard";
import { loadEmailVoice, wordBandFor } from "@/lib/ai/email-voice";
import { loadOrgAiProfile } from "@/lib/ai/org-ai-profile";
import type { PersonalizationEvidenceItem } from "@/lib/ai/draft-types";
import { getBulkDraftRunner } from "@/lib/ai/bulk-runner";
import { RunnerNotConfiguredError } from "@/lib/research/runner";
import { editDraftSchema, rejectDraftSchema } from "@/lib/validation/draft";
import { createGmailDraftForApproved } from "@/lib/integrations/gmail";

/** Review statuses from which a draft can be approved or rejected. */
const REVIEW_STATES: DraftStatus[] = [DraftStatus.GENERATED, DraftStatus.EDITED];

async function ctxOrError(min: Role): Promise<{ ctx: OrgContext } | { error: FormState }> {
  try {
    return { ctx: await requireRole(min) };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

function ownedDraft(orgId: string, draftId: string) {
  return prisma.emailDraft.findFirst({ where: { id: draftId, clinic: { orgId } } });
}

function actorOf(ctx: OrgContext) {
  return { id: ctx.userId, name: ctx.userName };
}

// ---------------------------------------------------------------------------
// Generate / regenerate
// ---------------------------------------------------------------------------

async function runGenerate(clinicId: string, ctx: OrgContext): Promise<FormState> {
  const provider = getAiProvider();
  if (!provider.isConfigured()) {
    return fail("AI drafting is not configured. Set ANTHROPIC_API_KEY in the environment.");
  }
  const context = await loadDraftContext(ctx.orgId, clinicId);
  if (!context) return fail("Lead not found.");

  try {
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
      actorOf(ctx),
    );
    revalidatePath(`/leads/${clinicId}`);
    revalidatePath("/leads");
    return result.status === "BLOCKED"
      ? { ok: true, message: `Draft blocked: ${result.blockedReason ?? "insufficient evidence"}` }
      : {
          ok: true,
          message:
            result.reviewWarnings.length > 0
              ? `Draft ready for review with ${result.reviewWarnings.length} warning(s).`
              : "Draft ready for review.",
        };
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return fail(e.message);
    if (e instanceof AiGenerationError) {
      return fail("The AI provider could not produce a valid draft. Please try again.");
    }
    throw e;
  }
}

export async function generateDraftAction(clinicId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  return runGenerate(clinicId, guard.ctx);
}

/** Regeneration is a fresh generation that bumps the version and snapshots. */
export async function regenerateDraftAction(clinicId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  return runGenerate(clinicId, guard.ctx);
}

// ---------------------------------------------------------------------------
// Edit (returns an approved draft to review)
// ---------------------------------------------------------------------------

export async function editDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const draftId = String(formData.get("draftId") ?? "");
  const draft = await ownedDraft(ctx.orgId, draftId);
  if (!draft) return fail("Draft not found.");

  const parsed = editDraftSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const { subject, body } = parsed.data;

  // Re-validate the edited text with the same safety rules (no claim mapping on a
  // free edit, so loss/revenue claims are gated on the draft's stored evidence).
  const evidence = (draft.personalizationEvidence as unknown as PersonalizationEvidenceItem[]) ?? [];
  // Use the org's own length target and use case so an edit is judged by the
  // same rules the draft was generated under.
  const [voice, aiProfile] = await Promise.all([
    loadEmailVoice(ctx.orgId),
    loadOrgAiProfile(ctx.orgId),
  ]);
  const scan = scanContent({
    body,
    subject,
    clinicName: draft.clinicName || "",
    hasVerifiedEvidence: evidence.some((e) => e.isFact),
    wordBand: wordBandFor(voice),
    blockPhi: aiProfile.useCase === "patient_referral",
  });
  const blocked = scan.blockedReasons.length > 0;

  await transitionDraft(
    draft,
    {
      subject,
      body,
      editedBody: body,
      status: blocked ? DraftStatus.BLOCKED : DraftStatus.EDITED,
      blockedReason: blocked ? scan.blockedReasons.join(" ") : null,
      reviewWarnings: scan.warnings,
      wordCount: scan.wordCount,
      // Editing an approved draft returns it to review.
      approvedById: null,
      approvedAt: null,
      rejectedById: null,
      rejectedAt: null,
      rejectedReason: null,
    },
    "edited",
    actorOf(ctx),
    null,
  );

  await prisma.outreachActivity.create({
    data: {
      clinicId: draft.clinicId,
      type: ActivityType.DRAFT_EDITED,
      actorId: ctx.userId,
      actorName: ctx.userName,
      note: blocked ? "Edited draft blocked by safety checks." : "Draft edited; returned to review.",
    },
  });

  revalidatePath(`/leads/${draft.clinicId}`);
  return blocked
    ? { ok: true, message: "Saved, but the edit was blocked by safety checks." }
    : { ok: true, message: "Draft saved and returned to review." };
}

// ---------------------------------------------------------------------------
// Approve / reject
// ---------------------------------------------------------------------------

export async function approveDraftAction(
  draftId: string,
): Promise<FormState & { gmailCreated?: boolean }> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const draft = await ownedDraft(ctx.orgId, draftId);
  if (!draft) return fail("Draft not found.");
  if (draft.status === DraftStatus.BLOCKED) {
    return fail("This draft is blocked by safety checks and cannot be approved. Edit or regenerate it first.");
  }
  if (!REVIEW_STATES.includes(draft.status)) {
    return fail("Only a draft in review can be approved.");
  }

  await transitionDraft(
    draft,
    { status: DraftStatus.APPROVED, approvedById: ctx.userId, approvedAt: new Date() },
    "approved",
    actorOf(ctx),
    null,
  );
  await prisma.outreachActivity.create({
    data: {
      clinicId: draft.clinicId,
      type: ActivityType.DRAFT_APPROVED,
      actorId: ctx.userId,
      actorName: ctx.userName,
      note: "Draft approved.",
    },
  });

  // One-click flow: approving also creates the Gmail draft. All Gmail safety
  // guards still run inside createGmailDraftForApproved (a usable connection is
  // required, plus do-not-contact / suppression / unsubscribe), it is idempotent
  // per approved version, and it never sends. If Gmail is not connected (or a
  // guard blocks it), the approval still succeeds and gmailCreated is false.
  const gmail = await createGmailDraftForApproved(ctx.orgId, draftId, {
    id: ctx.userId,
    name: ctx.userName,
  });

  revalidatePath(`/leads/${draft.clinicId}`);
  revalidatePath("/leads");

  if (gmail.ok) {
    return {
      ok: true,
      gmailCreated: true,
      message:
        gmail.outcome === "already_exists"
          ? "Draft approved. A Gmail draft already existed for this version."
          : "Draft approved and Gmail draft created. Review and send it from Gmail.",
    };
  }
  return {
    ok: true,
    gmailCreated: false,
    message: `Draft approved. Gmail draft not created: ${gmail.message ?? "Gmail is not connected."}`,
  };
}

export async function rejectDraftAction(draftId: string, reason: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const parsed = rejectDraftSchema.safeParse({ reason });
  if (!parsed.success) return fail("A reason is required to reject a draft.");

  const draft = await ownedDraft(ctx.orgId, draftId);
  if (!draft) return fail("Draft not found.");

  await transitionDraft(
    draft,
    {
      status: DraftStatus.REJECTED,
      rejectedById: ctx.userId,
      rejectedAt: new Date(),
      rejectedReason: parsed.data.reason,
    },
    "rejected",
    actorOf(ctx),
    parsed.data.reason,
  );
  await prisma.outreachActivity.create({
    data: {
      clinicId: draft.clinicId,
      type: ActivityType.DRAFT_REJECTED,
      actorId: ctx.userId,
      actorName: ctx.userName,
      note: `Draft rejected: ${parsed.data.reason}`,
    },
  });

  revalidatePath(`/leads/${draft.clinicId}`);
  return { ok: true, message: "Draft rejected." };
}

// ---------------------------------------------------------------------------
// Restore a previous version
// ---------------------------------------------------------------------------

export async function restoreDraftVersionAction(versionId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const snapshot = await prisma.draftVersion.findFirst({
    where: { id: versionId, draft: { clinic: { orgId: ctx.orgId } } },
    include: { draft: true },
  });
  if (!snapshot) return fail("Version not found.");
  const draft = snapshot.draft;

  await transitionDraft(
    draft,
    {
      subject: snapshot.subject,
      body: snapshot.body,
      service: snapshot.service,
      confidence: snapshot.confidence,
      reviewWarnings: snapshot.reviewWarnings,
      personalizationEvidence: jsonOrNull(snapshot.personalizationEvidence),
      claimMap: jsonOrNull(snapshot.claimMap),
      editedBody: null,
      // Restoring returns the draft to review, regardless of the snapshot status.
      status: DraftStatus.EDITED,
      blockedReason: null,
      approvedById: null,
      approvedAt: null,
      rejectedById: null,
      rejectedAt: null,
      rejectedReason: null,
    },
    "restored",
    actorOf(ctx),
    `Restored version ${snapshot.version}.`,
  );
  await prisma.outreachActivity.create({
    data: {
      clinicId: draft.clinicId,
      type: ActivityType.DRAFT_EDITED,
      actorId: ctx.userId,
      actorName: ctx.userName,
      note: `Restored draft version ${snapshot.version}.`,
    },
  });

  revalidatePath(`/leads/${draft.clinicId}`);
  return { ok: true, message: `Restored version ${snapshot.version}.` };
}

// ---------------------------------------------------------------------------
// Create a Gmail draft from an approved outreach draft (no sending)
// ---------------------------------------------------------------------------

export async function createGmailDraftAction(draftId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const draft = await ownedDraft(ctx.orgId, draftId);
  if (!draft) return fail("Draft not found.");

  const res = await createGmailDraftForApproved(ctx.orgId, draftId, {
    id: ctx.userId,
    name: ctx.userName,
  });

  revalidatePath(`/leads/${draft.clinicId}`);
  revalidatePath("/leads");

  if (res.ok) {
    return {
      ok: true,
      message:
        res.outcome === "already_exists"
          ? "A Gmail draft already exists for this approved version."
          : "Gmail draft created in your connected account. Review and send it from Gmail.",
    };
  }
  return fail(res.message ?? "Could not create the Gmail draft.");
}

// ---------------------------------------------------------------------------
// Bulk drafting for a campaign's qualified leads
// ---------------------------------------------------------------------------

export async function bulkGenerateDraftsAction(campaignId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const campaign = await prisma.searchCampaign.findFirst({ where: { id: campaignId, orgId: ctx.orgId } });
  if (!campaign) return fail("Campaign not found.");

  const provider = getAiProvider();
  if (!provider.isConfigured()) {
    return fail("AI drafting is not configured. Set ANTHROPIC_API_KEY in the environment.");
  }

  const job = await prisma.researchJob.create({
    data: { orgId: ctx.orgId, campaignId, type: "draft.bulk", status: "QUEUED" },
  });

  try {
    const runner = getBulkDraftRunner();
    await runner.start(job.id, campaignId);
  } catch (e) {
    await prisma.researchJob.update({
      where: { id: job.id },
      data: { status: "FAILED", message: e instanceof Error ? e.message.slice(0, 500) : "Runner error." },
    });
    if (e instanceof RunnerNotConfiguredError) return fail(e.message);
    throw e;
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/jobs");
  return { ok: true, message: "Bulk drafting started. Track progress on the Jobs page." };
}

/**
 * Org-wide bulk drafting: every qualified lead that has no draft yet, across
 * every campaign and manually added leads alike.
 *
 * Deliberately skips leads that already have a draft, so pressing this twice
 * never regenerates work you have already reviewed and never discards an
 * approval. That makes it safe to re-run while a campaign is still discovering
 * clinics — which is the normal case.
 */
export async function bulkGenerateAllDraftsAction(): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const provider = getAiProvider();
  if (!provider.isConfigured()) {
    return fail("AI drafting is not configured. Set ANTHROPIC_API_KEY in the environment.");
  }

  // campaignId stays null: that is what marks this an org-wide run in
  // PrismaDraftJobRepository.loadTargets.
  const job = await prisma.researchJob.create({
    data: { orgId: ctx.orgId, type: "draft.bulk", status: "QUEUED" },
  });

  try {
    const runner = getBulkDraftRunner();
    await runner.start(job.id);
  } catch (e) {
    await prisma.researchJob.update({
      where: { id: job.id },
      data: { status: "FAILED", message: e instanceof Error ? e.message.slice(0, 500) : "Runner error." },
    });
    if (e instanceof RunnerNotConfiguredError) return fail(e.message);
    throw e;
  }

  revalidatePath("/review");
  revalidatePath("/jobs");
  return { ok: true, message: "Drafting started. Track progress on the Jobs page." };
}
