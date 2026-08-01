import { DraftStatus } from "@prisma/client";

/**
 * Deterministic pre-flight checks that must ALL pass before an approved outreach
 * draft may create a Gmail draft (Phase 6). Pure and unit-testable: the caller
 * gathers the facts (draft status, recipient, suppression, connection) and this
 * function decides. Nothing here performs I/O or sends anything.
 */

export type GmailGuardReason =
  | "not_approved"
  | "no_recipient"
  | "invalid_recipient"
  | "do_not_contact"
  | "suppressed"
  | "unsubscribed"
  | "not_connected";

export interface GmailGuardInput {
  status: DraftStatus;
  recipientEmail: string | null | undefined;
  doNotContact: boolean;
  /** A matching suppression-list entry (email or domain), if any. */
  suppressed: boolean;
  /** A matching unsubscribe record, if tracked separately from suppression. */
  unsubscribed: boolean;
  /** True when a usable, authorized Gmail connection is available. */
  connected: boolean;
}

export interface GmailGuardResult {
  ok: boolean;
  reason?: GmailGuardReason;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MESSAGES: Record<GmailGuardReason, string> = {
  not_approved: "Only an approved, unchanged draft can create a Gmail draft.",
  no_recipient: "This lead has no public recipient email address.",
  invalid_recipient: "The recipient email address is not valid.",
  do_not_contact: "This lead is marked do-not-contact.",
  suppressed: "This recipient is on the suppression list.",
  unsubscribed: "This recipient has an unsubscribe record and must not be contacted.",
  not_connected: "No authorized Google account is connected for Gmail.",
};

function fail(reason: GmailGuardReason): GmailGuardResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

export function evaluateGmailGuards(input: GmailGuardInput): GmailGuardResult {
  // Order matters: report the most fundamental problem first.
  if (input.status !== DraftStatus.APPROVED) return fail("not_approved");
  const email = input.recipientEmail?.trim();
  if (!email) return fail("no_recipient");
  if (!EMAIL_RE.test(email)) return fail("invalid_recipient");
  if (input.doNotContact) return fail("do_not_contact");
  if (input.suppressed) return fail("suppressed");
  if (input.unsubscribed) return fail("unsubscribed");
  if (!input.connected) return fail("not_connected");
  return { ok: true };
}

/** Domain portion of an email, lowercased (for suppression matching). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}
