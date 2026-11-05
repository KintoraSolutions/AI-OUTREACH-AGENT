import { describe, expect, it } from "vitest";
import { DraftStatus } from "@prisma/client";
import {
  emailDomain,
  evaluateGmailGuards,
  normalizeEmail,
  type GmailGuardInput,
} from "@/lib/integrations/gmail-guard";

const base: GmailGuardInput = {
  status: DraftStatus.APPROVED,
  recipientEmail: "owner@clinic.example",
  doNotContact: false,
  suppressed: false,
  unsubscribed: false,
  alreadyContactedBy: null,
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

/**
 * Duplicate-recipient guard.
 *
 * Lead records dedupe on domain and name, so the same clinic cannot exist
 * twice. Two *different* records sharing one inbox is the case that slipped
 * through — a practice group answering for several sites, or an owner listing
 * the same address on two domains — and the recipient would simply get two
 * emails with nothing to stop it.
 */
describe("evaluateGmailGuards — already contacted", () => {
  const ready = {
    status: DraftStatus.APPROVED,
    recipientEmail: "info@riverbend.example",
    doNotContact: false,
    suppressed: false,
    unsubscribed: false,
    alreadyContactedBy: null as string | null,
    connected: true,
  };

  it("passes when no other lead has used this address", () => {
    expect(evaluateGmailGuards(ready).ok).toBe(true);
  });

  it("blocks when another lead already has outreach to the same address", () => {
    const res = evaluateGmailGuards({ ...ready, alreadyContactedBy: "Northgate Eye Care" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("already_contacted");
  });

  it("names the other lead, so it is obvious which record to fix", () => {
    const res = evaluateGmailGuards({ ...ready, alreadyContactedBy: "Northgate Eye Care" });
    expect(res.message).toContain("Northgate Eye Care");
    expect(res.message).toMatch(/do-not-contact|own address/i);
  });

  it("still reports a more fundamental problem first", () => {
    // A do-not-contact lead should say so, not complain about a duplicate.
    expect(
      evaluateGmailGuards({ ...ready, doNotContact: true, alreadyContactedBy: "Other" }).reason,
    ).toBe("do_not_contact");
    expect(
      evaluateGmailGuards({ ...ready, status: DraftStatus.GENERATED, alreadyContactedBy: "Other" })
        .reason,
    ).toBe("not_approved");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Info@Riverbend.Example ")).toBe("info@riverbend.example");
  });

  it("strips a plus tag, which every major provider routes to one mailbox", () => {
    expect(normalizeEmail("info+optometry@riverbend.example")).toBe("info@riverbend.example");
  });

  it("ignores dots for Gmail only", () => {
    expect(normalizeEmail("first.last@gmail.com")).toBe("firstlast@gmail.com");
    expect(normalizeEmail("first.last@googlemail.com")).toBe("firstlast@googlemail.com");
    // Elsewhere a dot is significant and must not be collapsed.
    expect(normalizeEmail("first.last@riverbend.example")).toBe("first.last@riverbend.example");
  });

  it("treats two spellings of one Gmail inbox as equal", () => {
    expect(normalizeEmail("Dr.Smith+leads@Gmail.com")).toBe(normalizeEmail("drsmith@gmail.com"));
  });

  it("keeps distinct addresses distinct", () => {
    expect(normalizeEmail("a@x.example")).not.toBe(normalizeEmail("b@x.example"));
    expect(normalizeEmail("info@a.example")).not.toBe(normalizeEmail("info@b.example"));
  });

  it("does not mangle input that is not an address", () => {
    expect(normalizeEmail("not-an-email")).toBe("not-an-email");
    expect(normalizeEmail("@nolocal.example")).toBe("@nolocal.example");
  });
});
