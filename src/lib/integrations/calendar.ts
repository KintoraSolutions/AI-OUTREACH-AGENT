import { ActivityType, IntegrationEventType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { logIntegrationActivity } from "@/lib/integrations/activity";
import { getUsableConnection } from "@/lib/integrations/google-connections";
import { getValidAccessToken } from "@/lib/integrations/google-tokens";
import { HttpGoogleApiClient, type GoogleApiClient } from "@/lib/integrations/google-api";
import type { FetchLike } from "@/lib/integrations/google-oauth";

/**
 * Optional Google Calendar sync for follow-ups (Phase 6). Idempotent: a
 * follow-up stores its Google `calendarEventId`, so a repeated sync UPDATES the
 * existing event instead of creating a duplicate. Cancellation deletes the
 * event. All calls use `sendUpdates=none` and add no attendees, so the clinic is
 * never invited and no guest notifications are sent.
 */

const DEFAULT_DURATION_MS = 30 * 60 * 1000;

export interface CalendarActor {
  id: string;
  name: string | null;
}

export interface CalendarDeps {
  apiClient?: GoogleApiClient;
  fetchImpl?: FetchLike;
}

export type CalendarOutcome = "created" | "updated" | "cancelled" | "not_connected" | "failed" | "noop";

export interface CalendarSyncResult {
  ok: boolean;
  outcome: CalendarOutcome;
  eventId?: string;
  message?: string;
}

/** Create or update the Calendar event for a follow-up (idempotent by eventId). */
export async function syncFollowUpToCalendar(
  followUpId: string,
  actor: CalendarActor,
  deps: CalendarDeps = {},
): Promise<CalendarSyncResult> {
  const task = await prisma.followUpTask.findUnique({
    where: { id: followUpId },
    include: { clinic: { select: { name: true, id: true } } },
  });
  if (!task) return { ok: false, outcome: "failed", message: "Follow-up not found." };

  const connection = await getUsableConnection(task.orgId, actor.id, "calendar");
  if (!connection) {
    return { ok: false, outcome: "not_connected", message: "No connected Google account with Calendar access." };
  }

  const startIso = task.dueDate.toISOString();
  const endIso = new Date(task.dueDate.getTime() + DEFAULT_DURATION_MS).toISOString();
  const event = {
    summary: task.title?.trim() || `Follow up: ${task.clinic.name}`,
    description: task.note?.trim() || `Outreach follow-up for ${task.clinic.name}.`,
    startIso,
    endIso,
  };

  try {
    const accessToken = await getValidAccessToken(connection, deps.fetchImpl);
    const api = deps.apiClient ?? new HttpGoogleApiClient(deps.fetchImpl);

    const isUpdate = !!task.calendarEventId;
    const result = isUpdate
      ? await api.updateCalendarEvent(accessToken, task.calendarEventId!, event)
      : await api.createCalendarEvent(accessToken, event);

    await prisma.followUpTask.update({
      where: { id: task.id },
      data: {
        calendarEventId: result.id,
        calendarConnectionId: connection.id,
        calendarStatus: "created",
        calendarSyncedAt: new Date(),
      },
    });

    await logIntegrationActivity({
      orgId: task.orgId,
      userId: actor.id,
      clinicId: task.clinicId,
      type: isUpdate ? IntegrationEventType.CALENDAR_EVENT_UPDATED : IntegrationEventType.CALENDAR_EVENT_CREATED,
      provider: "calendar",
      summary: `${isUpdate ? "Updated" : "Created"} calendar event for follow-up on ${task.clinic.name}.`,
      metadata: { followUpId: task.id, eventId: result.id },
    });
    if (!isUpdate) {
      await logActivity({
        clinicId: task.clinicId,
        type: ActivityType.CALENDAR_EVENT_CREATED,
        actorId: actor.id,
        actorName: actor.name,
        note: `Calendar event created for follow-up on ${task.dueDate.toISOString().slice(0, 10)}.`,
        metadata: { eventId: result.id },
      });
    }

    return { ok: true, outcome: isUpdate ? "updated" : "created", eventId: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Calendar sync failed.";
    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { calendarStatus: "error" },
    });
    await logIntegrationActivity({
      orgId: task.orgId,
      userId: actor.id,
      clinicId: task.clinicId,
      type: IntegrationEventType.INTEGRATION_ERROR,
      provider: "calendar",
      summary: "Calendar sync failed.",
      metadata: { followUpId: task.id, error: error instanceof Error ? error.name : "unknown" },
    });
    return { ok: false, outcome: "failed", message };
  }
}

/** Cancel (delete) the Calendar event for a follow-up, if one exists. */
export async function cancelFollowUpCalendar(
  followUpId: string,
  actor: CalendarActor,
  deps: CalendarDeps = {},
): Promise<CalendarSyncResult> {
  const task = await prisma.followUpTask.findUnique({ where: { id: followUpId } });
  if (!task) return { ok: false, outcome: "failed", message: "Follow-up not found." };
  if (!task.calendarEventId) return { ok: true, outcome: "noop" };

  const connection = task.calendarConnectionId
    ? await prisma.googleConnection.findUnique({ where: { id: task.calendarConnectionId } })
    : await getUsableConnection(task.orgId, actor.id, "calendar");
  if (!connection || connection.revokedAt) {
    return { ok: false, outcome: "not_connected", message: "No connected Google account with Calendar access." };
  }

  try {
    const accessToken = await getValidAccessToken(connection, deps.fetchImpl);
    const api = deps.apiClient ?? new HttpGoogleApiClient(deps.fetchImpl);
    await api.cancelCalendarEvent(accessToken, task.calendarEventId);

    // Clear the stored event id so a later re-sync creates a fresh event rather
    // than trying to update the now-deleted one.
    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { calendarEventId: null, calendarStatus: "cancelled", calendarSyncedAt: new Date() },
    });
    await logIntegrationActivity({
      orgId: task.orgId,
      userId: actor.id,
      clinicId: task.clinicId,
      type: IntegrationEventType.CALENDAR_EVENT_CANCELLED,
      provider: "calendar",
      summary: "Cancelled calendar event for a follow-up.",
      metadata: { followUpId: task.id, eventId: task.calendarEventId },
    });
    return { ok: true, outcome: "cancelled", eventId: task.calendarEventId };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Calendar cancel failed.";
    return { ok: false, outcome: "failed", message };
  }
}
