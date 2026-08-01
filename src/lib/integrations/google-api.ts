import { GoogleApiError } from "@/lib/integrations/errors";
import type { FetchLike } from "@/lib/integrations/google-oauth";

/**
 * Thin REST client for the Google APIs we use. Deliberately minimal and
 * capability-scoped:
 *  - Gmail: create DRAFTS only (`users.drafts.create`). There is intentionally
 *    NO method that calls any Gmail send endpoint.
 *  - Calendar: create / update / cancel events with `sendUpdates=none` so the
 *    clinic is never invited and no guest notifications are sent.
 *
 * All calls take a short-lived access token (never a stored/encrypted one) and
 * go through an injectable `fetch`, so tests assert the exact endpoints and
 * verify no send endpoint is ever touched.
 */

const GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface GmailDraftResult {
  id: string;
  messageId?: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  /** ISO 8601 start/end timestamps. */
  startIso: string;
  endIso: string;
}

export interface CalendarEventResult {
  id: string;
  htmlLink?: string;
  status?: string;
}

export interface GoogleApiClient {
  createGmailDraft(accessToken: string, rawMessageBase64Url: string): Promise<GmailDraftResult>;
  createCalendarEvent(accessToken: string, event: CalendarEventInput): Promise<CalendarEventResult>;
  updateCalendarEvent(
    accessToken: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<CalendarEventResult>;
  cancelCalendarEvent(accessToken: string, eventId: string): Promise<void>;
}

async function readError(res: Response): Promise<never> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    // ignore
  }
  throw new GoogleApiError(`Google API error (${res.status})${detail ? `: ${detail}` : ""}`, res.status);
}

export class HttpGoogleApiClient implements GoogleApiClient {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  private authHeaders(accessToken: string) {
    return {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };
  }

  async createGmailDraft(accessToken: string, rawMessageBase64Url: string): Promise<GmailDraftResult> {
    const res = await this.fetchImpl(GMAIL_DRAFTS_URL, {
      method: "POST",
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ message: { raw: rawMessageBase64Url } }),
    });
    if (!res.ok) await readError(res);
    const data = (await res.json()) as { id?: string; message?: { id?: string } };
    if (!data.id) throw new GoogleApiError("Gmail did not return a draft id.");
    return { id: data.id, messageId: data.message?.id };
  }

  async createCalendarEvent(accessToken: string, event: CalendarEventInput): Promise<CalendarEventResult> {
    // sendUpdates=none => no guest notifications; no attendees => clinic not invited.
    const res = await this.fetchImpl(`${CALENDAR_EVENTS_URL}?sendUpdates=none`, {
      method: "POST",
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(toEventBody(event)),
    });
    if (!res.ok) await readError(res);
    const data = (await res.json()) as CalendarEventResult;
    if (!data.id) throw new GoogleApiError("Calendar did not return an event id.");
    return data;
  }

  async updateCalendarEvent(
    accessToken: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<CalendarEventResult> {
    const res = await this.fetchImpl(
      `${CALENDAR_EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: "PATCH",
        headers: this.authHeaders(accessToken),
        body: JSON.stringify(toEventBody(event)),
      },
    );
    if (!res.ok) await readError(res);
    return (await res.json()) as CalendarEventResult;
  }

  async cancelCalendarEvent(accessToken: string, eventId: string): Promise<void> {
    const res = await this.fetchImpl(
      `${CALENDAR_EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=none`,
      { method: "DELETE", headers: this.authHeaders(accessToken) },
    );
    // 410 Gone means the event was already deleted; treat as success.
    if (!res.ok && res.status !== 404 && res.status !== 410) await readError(res);
  }
}

function toEventBody(event: CalendarEventInput) {
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startIso },
    end: { dateTime: event.endIso },
    // No attendees, so the clinic is never invited by default.
  };
}
