import { describe, expect, it } from "vitest";
import { DraftStatus } from "@prisma/client";
import { evaluateGmailGuards, emailDomain, type GmailGuardInput } from "@/lib/integrations/gmail-guard";

const base: GmailGuardInput = {
  status: DraftStatus.APPROVED,
  recipientEmail: "owner@clinic.example",
  doNotContact: false,
  suppressed: false,
  unsubscribed: false,
  connected: true,
};

describe("evaluateGmailGuards", () => {
  it("passes when every precondition is met", () => {
    expect(evaluateGmailGuards(base)).toEqual({ ok: true });
  });

  it("blocks a draft that is not approved", () => {
    for (const status of [DraftStatus.GENERATED, DraftStatus.EDITED, DraftStatus.BLOCKED, DraftStatus.REJECTED]) {
      expect(evaluateGmailGuards({ ...base, status }).reason).toBe("not_approved");
    }
  });

  it("blocks when there is no recipient email", () => {
    expect(evaluateGmailGuards({ ...base, recipientEmail: null }).reason).toBe("no_recipient");
    expect(evaluateGmailGuards({ ...base, recipientEmail: "   " }).reason).toBe("no_recipient");
  });

  it("blocks an invalid recipient email", () => {
    expect(evaluateGmailGuards({ ...base, recipientEmail: "not-an-email" }).reason).toBe("invalid_recipient");
  });

  it("blocks do-not-contact leads", () => {
    expect(evaluateGmailGuards({ ...base, doNotContact: true }).reason).toBe("do_not_contact");
  });

  it("blocks suppressed recipients", () => {
    expect(evaluateGmailGuards({ ...base, suppressed: true }).reason).toBe("suppressed");
  });

  it("blocks recipients with an unsubscribe record", () => {
    expect(evaluateGmailGuards({ ...base, suppressed: false, unsubscribed: true }).reason).toBe("unsubscribed");
  });

  it("blocks when no Google account is connected", () => {
    expect(evaluateGmailGuards({ ...base, connected: false }).reason).toBe("not_connected");
  });

  it("extracts the email domain for suppression matching", () => {
    expect(emailDomain("Owner@Clinic.Example")).toBe("clinic.example");
    expect(emailDomain("bad")).toBe("");
  });
});
