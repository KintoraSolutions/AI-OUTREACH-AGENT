import {
  ActivityType,
  GmailDraftStatus,
  IntegrationEventType,
  PipelineStage,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { logIntegrationActivity } from "@/lib/integrations/activity";
import { getUsableConnection } from "@/lib/integrations/google-connections";
import { getValidAccessToken } from "@/lib/integrations/google-tokens";
import { HttpGoogleApiClient, type GoogleApiClient } from "@/lib/integrations/google-api";
import { buildGmailRaw } from "@/lib/integrations/gmail-mime";
import {
  emailDomain,
  evaluateGmailGuards,
  normalizeEmail,
  type GmailGuardReason,
} from "@/lib/integrations/gmail-guard";
import type { FetchLike } from "@/lib/integrations/google-oauth";

/**
 * Create a Gmail DRAFT from an approved outreach draft (Phase 6). Enforces every
 * safety precondition, is idempotent per approved draft version (repeated
 * requests never create duplicate Gmail drafts), stores the result + errors, and
 * advances the pipeline to "Gmail draft created" WITHOUT marking the lead
 * contacted. It never calls any Gmail send API.
 */

export interface GmailActor {
  id: string;
  name: string | null;
}

export interface CreateGmailDeps {
  apiClient?: GoogleApiClient;
  fetchImpl?: FetchLike;
}

export type CreateGmailOutcome = "created" | "already_exists" | "blocked" | "failed";

export interface CreateGmailResult {
  ok: boolean;
  outcome: CreateGmailOutcome;
  reason?: GmailGuardReason | string;
  message?: string;
  gmailDraftId?: string;
  recordId?: string;
}

async function isSuppressed(orgId: string, email: string): Promise<{ suppressed: boolean; unsubscribed: boolean }> {
  const domain = emailDomain(email);
  const entries = await prisma.suppressionEntry.findMany({
    where: {
      orgId,
      emailOrDomain: { in: [email.toLowerCase(), email, domain].filter(Boolean) },
    },
  });
  const suppressed = entries.length > 0;
  const unsubscribed = entries.some((e) => /unsubscrib/i.test(e.reason ?? ""));
  return { suppressed, unsubscribed };
}

export async function createGmailDraftForApproved(
  orgId: string,
  draftId: string,
  actor: GmailActor,
  deps: CreateGmailDeps = {},
): Promise<CreateGmailResult> {
  const draft = await prisma.emailDraft.findFirst({
    where: { id: draftId, clinic: { orgId } },
    include: { clinic: { include: { organization: { select: { senderName: true } } } } },
  });
  if (!draft) return { ok: false, outcome: "blocked", reason: "not_found", message: "Draft not found." };

  const recipientEmail = draft.recipientEmail?.trim() ?? null;
  const { suppressed, unsubscribed } = recipientEmail
    ? await isSuppressed(orgId, recipientEmail)
    : { suppressed: false, unsubscribed: false };

  // A usable Gmail connection: the user's own, else the org default sender.
  const connection = await getUsableConnection(orgId, actor.id, "gmail");

  const alreadyContactedBy = recipientEmail
    ? await findLeadAlreadyContacted(orgId, draft.clinicId, recipientEmail)
    : null;

  const guard = evaluateGmailGuards({
    status: draft.status,
    recipientEmail,
    doNotContact: draft.clinic.doNotContact,
    suppressed,
    unsubscribed,
    alreadyContactedBy,
    connected: connection != null,
  });

  if (!guard.ok) {
    // Record blocks that are compliance-relevant on the immutable integration log.
    if (
      guard.reason === "suppressed" ||
      guard.reason === "do_not_contact" ||
      guard.reason === "unsubscribed" ||
      guard.reason === "already_contacted"
    ) {
      await logIntegrationActivity({
        orgId,
        userId: actor.id,
        clinicId: draft.clinicId,
        type: IntegrationEventType.SUPPRESSION_BLOCKED,
        provider: "gmail",
        summary: `Gmail draft blocked: ${guard.message}`,
        metadata: { draftId: draft.id, reason: guard.reason },
      });
    }
    return { ok: false, outcome: "blocked", reason: guard.reason, message: guard.message };
  }

  // Idempotency: one Gmail draft per approved EmailDraft version.
  const existing = await prisma.gmailDraftRecord.findUnique({
    where: { emailDraftId_sourceVersion: { emailDraftId: draft.id, sourceVersion: draft.version } },
  });
  if (existing && existing.status === GmailDraftStatus.CREATED && existing.gmailDraftId) {
    return {
      ok: true,
      outcome: "already_exists",
      gmailDraftId: existing.gmailDraftId,
      recordId: existing.id,
      message: "A Gmail draft already exists for this approved version.",
    };
  }

  // Claim (or reuse) the record in PENDING state.
  const record = await prisma.gmailDraftRecord.upsert({
    where: { emailDraftId_sourceVersion: { emailDraftId: draft.id, sourceVersion: draft.version } },
    create: {
      orgId,
      clinicId: draft.clinicId,
      emailDraftId: draft.id,
      sourceVersion: draft.version,
      connectionId: connection!.id,
      connectionEmail: connection!.accountEmail,
      recipientEmail: recipientEmail!,
      subject: draft.subject,
      status: GmailDraftStatus.PENDING,
      createdById: actor.id,
      createdByName: actor.name,
    },
    update: {
      status: GmailDraftStatus.PENDING,
      error: null,
      connectionId: connection!.id,
      connectionEmail: connection!.accountEmail,
      recipientEmail: recipientEmail!,
      subject: draft.subject,
    },
  });

  try {
    const accessToken = await getValidAccessToken(connection!, deps.fetchImpl);
    const api = deps.apiClient ?? new HttpGoogleApiClient(deps.fetchImpl);
    const raw = buildGmailRaw({
      to: recipientEmail!,
      toName: draft.recipientName,
      from: connection!.accountEmail,
      fromName: draft.clinic.organization.senderName ?? connection!.accountEmail,
      subject: draft.subject,
      body: draft.body,
    });
    const created = await api.createGmailDraft(accessToken, raw);

    await prisma.$transaction(async (tx) => {
      await tx.gmailDraftRecord.update({
        where: { id: record.id },
        data: {
          status: GmailDraftStatus.CREATED,
          gmailDraftId: created.id,
          gmailMessageId: created.messageId ?? null,
          error: null,
        },
      });
      // Advance the pipeline to "Gmail draft created" — but only from APPROVED,
      // and NEVER to CONTACTED (marking contacted is a separate explicit action).
      if (draft.clinic.stage === PipelineStage.APPROVED) {
        await tx.clinic.update({
          where: { id: draft.clinicId },
          data: { stage: PipelineStage.GMAIL_DRAFT_CREATED },
        });
        await logActivity({
          clinicId: draft.clinicId,
          type: ActivityType.STAGE_CHANGED,
          actorId: actor.id,
          actorName: actor.name,
          note: "Stage changed from APPROVED to GMAIL_DRAFT_CREATED.",
          metadata: { from: PipelineStage.APPROVED, to: PipelineStage.GMAIL_DRAFT_CREATED },
          tx,
        });
      }
      await logActivity({
        clinicId: draft.clinicId,
        type: ActivityType.GMAIL_DRAFT_CREATED,
        actorId: actor.id,
        actorName: actor.name,
        note: `Gmail draft created in ${connection!.accountEmail ?? "the connected account"} for ${recipientEmail}.`,
        metadata: { gmailDraftId: created.id, sourceVersion: draft.version },
        tx,
      });
      await logIntegrationActivity({
        orgId,
        userId: actor.id,
        clinicId: draft.clinicId,
        type: IntegrationEventType.GMAIL_DRAFT_CREATED,
        provider: "gmail",
        summary: `Gmail draft created for ${recipientEmail}.`,
        metadata: { gmailDraftId: created.id, draftId: draft.id, sourceVersion: draft.version },
        tx,
      });
    });

    return { ok: true, outcome: "created", gmailDraftId: created.id, recordId: record.id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Gmail draft creation failed.";
    await prisma.gmailDraftRecord.update({
      where: { id: record.id },
      data: { status: GmailDraftStatus.FAILED, error: message },
    });
    await logActivity({
      clinicId: draft.clinicId,
      type: ActivityType.GMAIL_DRAFT_FAILED,
      actorId: actor.id,
      actorName: actor.name,
      note: `Gmail draft creation failed: ${message}`,
    });
    await logIntegrationActivity({
      orgId,
      userId: actor.id,
      clinicId: draft.clinicId,
      type: IntegrationEventType.INTEGRATION_ERROR,
      provider: "gmail",
      summary: "Gmail draft creation failed.",
      metadata: { draftId: draft.id, error: error instanceof Error ? error.name : "unknown" },
    });
    return { ok: false, outcome: "failed", message };
  }
}

/** Metadata shape returned to the UI (never includes tokens). */
export interface GmailDraftView {
  id: string;
  status: GmailDraftStatus;
  gmailDraftId: string | null;
  connectionEmail: string | null;
  recipientEmail: string;
  subject: string;
  sourceVersion: number;
  error: string | null;
  createdByName: string | null;
  createdAt: string;
}

export async function getGmailDraftForEmailDraft(
  emailDraftId: string,
): Promise<GmailDraftView | null> {
  const rec = await prisma.gmailDraftRecord.findFirst({
    where: { emailDraftId },
    orderBy: { sourceVersion: "desc" },
  });
  if (!rec) return null;
  return {
    id: rec.id,
    status: rec.status,
    gmailDraftId: rec.gmailDraftId,
    connectionEmail: rec.connectionEmail,
    recipientEmail: rec.recipientEmail,
    subject: rec.subject,
    sourceVersion: rec.sourceVersion,
    error: rec.error,
    createdByName: rec.createdByName,
    createdAt: rec.createdAt.toISOString(),
  };
}

/**
 * Another lead in this org whose outreach already sits in Gmail for the same
 * inbox, or null.
 *
 * Scoped to the same email domain so the scan stays selective, then compared on
 * the normalized form so `info+optometry@x.com` and `info@x.com` are recognised
 * as one mailbox. Only CREATED records count: a pending or failed attempt did
 * not reach anyone, and blocking on it would strand the lead permanently.
 */
async function findLeadAlreadyContacted(
  orgId: string,
  clinicId: string,
  recipientEmail: string,
): Promise<string | null> {
  const normalized = normalizeEmail(recipientEmail);
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  if (!domain) return null;

  const candidates = await prisma.gmailDraftRecord.findMany({
    where: {
      orgId,
      status: GmailDraftStatus.CREATED,
      clinicId: { not: clinicId },
      recipientEmail: { endsWith: `@${domain}`, mode: "insensitive" },
    },
    select: { recipientEmail: true, clinic: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const hit = candidates.find((c) => normalizeEmail(c.recipientEmail) === normalized);
  return hit?.clinic.name ?? null;
}
