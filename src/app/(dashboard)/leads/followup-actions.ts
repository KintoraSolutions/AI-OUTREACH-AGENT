"use server";

import { revalidatePath } from "next/cache";
import { ActivityType, FollowUpStatus, IntegrationEventType, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { OrgContext, PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { followUpSchema } from "@/lib/validation/lead";
import { logIntegrationActivity } from "@/lib/integrations/activity";
import { syncFollowUpToCalendar, cancelFollowUpCalendar } from "@/lib/integrations/calendar";

async function ctxOrError(min: Role): Promise<{ ctx: OrgContext } | { error: FormState }> {
  try {
    return { ctx: await requireRole(min) };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

function ownedClinic(orgId: string, clinicId: string) {
  return prisma.clinic.findFirst({ where: { id: clinicId, orgId } });
}

function ownedFollowUp(orgId: string, id: string) {
  return prisma.followUpTask.findFirst({ where: { id, orgId } });
}

function actorOf(ctx: OrgContext) {
  return { id: ctx.userId, name: ctx.userName };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createFollowUpAction(
  clinicId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const clinic = await ownedClinic(ctx.orgId, clinicId);
  if (!clinic) return fail("Lead not found.");

  const parsed = followUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error) };
  const d = parsed.data;

  // Assignee must be a member of this org; default to the current user.
  let assigneeId = ctx.userId;
  if (d.assigneeId && d.assigneeId !== ctx.userId) {
    const member = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, userId: d.assigneeId },
    });
    if (member) assigneeId = d.assigneeId;
  }

  const task = await prisma.followUpTask.create({
    data: {
      orgId: ctx.orgId,
      clinicId,
      campaignId: clinic.campaignId,
      title: d.title ?? null,
      dueDate: d.dueDate,
      note: d.note ?? null,
      priority: d.priority,
      status: FollowUpStatus.PENDING,
      assigneeId,
      createdById: ctx.userId,
    },
  });
  await prisma.clinic.update({ where: { id: clinicId }, data: { followUpDate: d.dueDate } });

  await logActivity({
    clinicId,
    type: ActivityType.FOLLOW_UP_SCHEDULED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: `Follow-up scheduled for ${d.dueDate.toISOString().slice(0, 16).replace("T", " ")}.`,
  });
  await logIntegrationActivity({
    orgId: ctx.orgId,
    userId: ctx.userId,
    clinicId,
    type: IntegrationEventType.FOLLOW_UP_CREATED,
    summary: `Follow-up created for ${clinic.name}.`,
    metadata: { followUpId: task.id, priority: d.priority },
  });

  let message = "Follow-up scheduled.";
  if (d.addToCalendar) {
    const sync = await syncFollowUpToCalendar(task.id, actorOf(ctx));
    message = sync.ok
      ? "Follow-up scheduled and added to Google Calendar."
      : `Follow-up scheduled. Calendar not synced: ${sync.message ?? "unavailable"}.`;
  }

  revalidatePath(`/leads/${clinicId}`);
  revalidatePath("/dashboard");
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Complete / cancel
// ---------------------------------------------------------------------------

export async function completeFollowUpAction(id: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const task = await ownedFollowUp(ctx.orgId, id);
  if (!task) return fail("Follow-up not found.");
  if (task.status === FollowUpStatus.COMPLETED) return { ok: true, message: "Already completed." };

  await prisma.followUpTask.update({
    where: { id },
    data: { status: FollowUpStatus.COMPLETED, done: true, completedAt: new Date() },
  });
  await logActivity({
    clinicId: task.clinicId,
    type: ActivityType.FOLLOW_UP_COMPLETED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: "Follow-up marked complete.",
  });
  await logIntegrationActivity({
    orgId: ctx.orgId,
    userId: ctx.userId,
    clinicId: task.clinicId,
    type: IntegrationEventType.FOLLOW_UP_COMPLETED,
    summary: "Follow-up completed.",
    metadata: { followUpId: id },
  });

  revalidatePath(`/leads/${task.clinicId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Follow-up completed." };
}

export async function cancelFollowUpAction(id: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const task = await ownedFollowUp(ctx.orgId, id);
  if (!task) return fail("Follow-up not found.");
  if (task.status === FollowUpStatus.CANCELLED) return { ok: true, message: "Already cancelled." };

  // Cancel any linked calendar event first (best-effort).
  if (task.calendarEventId) {
    await cancelFollowUpCalendar(id, actorOf(ctx)).catch(() => {});
  }

  await prisma.followUpTask.update({
    where: { id },
    data: { status: FollowUpStatus.CANCELLED, cancelledAt: new Date() },
  });
  await logActivity({
    clinicId: task.clinicId,
    type: ActivityType.FOLLOW_UP_CANCELLED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: "Follow-up cancelled.",
  });
  await logIntegrationActivity({
    orgId: ctx.orgId,
    userId: ctx.userId,
    clinicId: task.clinicId,
    type: IntegrationEventType.FOLLOW_UP_CANCELLED,
    summary: "Follow-up cancelled.",
    metadata: { followUpId: id },
  });

  revalidatePath(`/leads/${task.clinicId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Follow-up cancelled." };
}

// ---------------------------------------------------------------------------
// Manual calendar sync for an existing follow-up
// ---------------------------------------------------------------------------

export async function syncFollowUpCalendarAction(id: string): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const task = await ownedFollowUp(ctx.orgId, id);
  if (!task) return fail("Follow-up not found.");

  const sync = await syncFollowUpToCalendar(id, actorOf(ctx));
  revalidatePath(`/leads/${task.clinicId}`);
  if (sync.ok) {
    return { ok: true, message: sync.outcome === "updated" ? "Calendar event updated." : "Added to Google Calendar." };
  }
  if (sync.outcome === "not_connected") {
    return fail("Connect a Google account with Calendar access in Settings first.");
  }
  return fail(sync.message ?? "Could not sync to Calendar.");
}
