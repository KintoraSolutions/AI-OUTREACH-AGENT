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
  | "already_contacted"
  | "not_connected";

export interface GmailGuardInput {
  status: DraftStatus;
  recipientEmail: string | null | undefined;
  doNotContact: boolean;
  /** A matching suppression-list entry (email or domain), if any. */
  suppressed: boolean;
  /** A matching unsubscribe record, if tracked separately from suppression. */
  unsubscribed: boolean;
  /**
   * Name of another lead in the same org that already has outreach sitting in
   * Gmail for this same address, or null.
   *
   * Lead records dedupe on domain and name, so the same *clinic* cannot be
   * created twice — but two genuinely different records can share an inbox: a
   * practice group answering for several sites, or an owner who lists the same
   * address on two domains. Nothing downstream would have caught that, and the
   * recipient would simply receive two emails.
   */
  alreadyContactedBy: string | null;
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
  already_contacted: "This address already has outreach in Gmail for another lead.",
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
  if (input.alreadyContactedBy) {
    return {
      ok: false,
      reason: "already_contacted",
      // Naming the other lead is the point: without it there is no way to tell
      // which record to fix.
      message: `${MESSAGES.already_contacted} It was drafted for ${input.alreadyContactedBy}. Mark one of the two do-not-contact, or give this lead its own address.`,
    };
  }
  if (!input.connected) return fail("not_connected");
  return { ok: true };
}

/**
 * Reduce an address to the inbox it actually reaches.
 *
 * `+tag` suffixes are stripped because every major provider routes them to the
 * same mailbox, and dots are removed for Gmail only, where they are ignored.
 * Anything more aggressive risks treating two real people as one, which is the
 * worse error — a missed send is recoverable, an email never sent is not
 * obviously wrong to anyone.
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") local = local.replace(/\./g, "");

  return `${local}@${domain}`;
}

/** Domain portion of an email, lowercased (for suppression matching). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}
