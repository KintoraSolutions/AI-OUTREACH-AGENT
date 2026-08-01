import { describe, expect, it, vi } from "vitest";
import { HttpGoogleApiClient } from "@/lib/integrations/google-api";
import { GoogleApiError } from "@/lib/integrations/errors";

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}
function err(status: number): Response {
  return { ok: false, status, json: async () => ({}), text: async () => "boom" } as unknown as Response;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

describe("HttpGoogleApiClient — Gmail", () => {
  it("creates a DRAFT via the drafts endpoint and never a send endpoint", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => ok({ id: "draft-1", message: { id: "msg-1" } }));
    const client = new HttpGoogleApiClient(fetchImpl as unknown as typeof fetch);
    const res = await client.createGmailDraft("token", "cmF3");
    expect(res).toEqual({ id: "draft-1", messageId: "msg-1" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(url).not.toContain("/send");
    expect(init!.method).toBe("POST");
    expect(init!.headers).toMatchObject({ authorization: "Bearer token" });
    // The payload is a draft message with a raw body — never a send call.
    expect(String(init!.body)).toContain('"raw":"cmF3"');
  });

  it("surfaces provider failures as GoogleApiError", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => err(500));
    const client = new HttpGoogleApiClient(fetchImpl as unknown as typeof fetch);
    await expect(client.createGmailDraft("token", "cmF3")).rejects.toBeInstanceOf(GoogleApiError);
  });
});

describe("HttpGoogleApiClient — Calendar", () => {
  it("creates an event with sendUpdates=none and no attendees", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => ok({ id: "evt-1", htmlLink: "https://cal/evt-1" }));
    const client = new HttpGoogleApiClient(fetchImpl as unknown as typeof fetch);
    const res = await client.createCalendarEvent("token", {
      summary: "Follow up: Clinic",
      description: "note",
      startIso: "2026-09-01T10:00:00.000Z",
      endIso: "2026-09-01T10:30:00.000Z",
    });
    expect(res.id).toBe("evt-1");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("sendUpdates=none");
    const body = JSON.parse(String(init!.body));
    expect(body.attendees).toBeUndefined(); // clinic is never invited
    expect(body.start.dateTime).toBe("2026-09-01T10:00:00.000Z");
  });

  it("updates an event idempotently (PATCH to the stored event id)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => ok({ id: "evt-1" }));
    const client = new HttpGoogleApiClient(fetchImpl as unknown as typeof fetch);
    await client.updateCalendarEvent("token", "evt-1", {
      summary: "s",
      startIso: "2026-09-01T10:00:00.000Z",
      endIso: "2026-09-01T10:30:00.000Z",
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/events/evt-1");
    expect(url).toContain("sendUpdates=none");
    expect(init!.method).toBe("PATCH");
  });

  it("treats a 410 Gone on cancel as success", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => err(410));
    const client = new HttpGoogleApiClient(fetchImpl as unknown as typeof fetch);
    await expect(client.cancelCalendarEvent("token", "evt-1")).resolves.toBeUndefined();
  });

  it("raises on a real cancel failure", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => err(500));
    const client = new HttpGoogleApiClient(fetchImpl as unknown as typeof fetch);
    await expect(client.cancelCalendarEvent("token", "evt-1")).rejects.toBeInstanceOf(GoogleApiError);
  });

  it("exposes no method that could send a Gmail message", () => {
    const client = new HttpGoogleApiClient();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client));
    expect(methods).not.toContain("sendGmailMessage");
    expect(methods.some((m) => /send/i.test(m))).toBe(false);
  });
});
