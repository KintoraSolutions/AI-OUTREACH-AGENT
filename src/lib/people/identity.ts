/**
 * Deciding whether two published names are the same person.
 *
 * This is the riskiest step in physician-level outreach, and it fails
 * asymmetrically. Failing to merge two records for one physician costs us a
 * little coverage and a duplicate row. Merging two different physicians
 * produces an email that tells Dr. Chen we noticed something about a clinic
 * she has never worked at, sent to an address that belongs to someone else.
 * One is an inconvenience; the other is the kind of mistake that ends the
 * conversation. So the rule throughout is: **prefer two records over a wrong
 * merge.**
 *
 * CPSO verification was deferred, which removes the one near-identifier this
 * step was going to lean on (see docs/planning/physician-outreach.md P2.5), so
 * a name alone is never enough. A match requires corroboration:
 *
 *   1. the same published email address, which is close to an identifier; or
 *   2. the same name **and** a clinic site we already associate with them.
 *
 * A bare name match with nothing behind it creates a second record. That is
 * the intended outcome, not a gap to close later by loosening this.
 *
 * `normalizePersonName` is deliberately not `normalizeName` from
 * `@/lib/leads/dedupe`: that one strips words like "medical", "health" and
 * "group" because it normalises *business* names, which would quietly mangle a
 * person called Sarah Health.
 */

/** Lowercase, unaccent, drop punctuation and honorifics. Never drops a word. */
export function normalizePersonName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFKD")
    // Strip combining marks so "É" and "E" compare equal.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Removed, not spaced: "O'Brien" and "OBrien" are one surname, and turning
    // the apostrophe into a space would split it into two tokens.
    .replace(/['‘’]/g, "")
    .replace(/\b(?:dr|doctor|prof|professor|mr|mrs|ms|miss)\b\.?/g, " ")
    .replace(/\b(?:md|do|od|dds|dmd|dc|rmt|phd|msc|bsc|frcpc)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The host of a URL, without `www.`, or null when it is not parseable. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

export interface IdentityCandidate {
  normalizedName: string;
  /** Only an address the clinic published. Never inferred. */
  email: string | null;
  /** Host of the clinic site this person was read from. */
  host: string | null;
}

export interface KnownPerson {
  id: string;
  normalizedName: string;
  /** Addresses already linked to this person. */
  emails: (string | null)[];
  /** Hosts of clinics this person is already affiliated with. */
  hosts: (string | null)[];
}

export type IdentityMatch =
  | { personId: string; basis: "email" | "name_and_host" }
  | null;

/**
 * Returns the person this candidate corroborates, or `null` to create a new
 * record. `known` should already be narrowed to plausible candidates: people
 * sharing the normalized name, plus anyone holding the candidate's address.
 */
export function resolveIdentity(
  candidate: IdentityCandidate,
  known: KnownPerson[],
): IdentityMatch {
  const email = normalizeEmail(candidate.email);

  // 1. The same published address. Two clinics publishing one address for one
  //    name is the strongest signal available without a register.
  if (email) {
    for (const person of known) {
      if (person.emails.some((e) => normalizeEmail(e) === email)) {
        return { personId: person.id, basis: "email" };
      }
    }
  }

  // 2. The same name on a site we already associate with them. This is what
  //    makes re-researching one clinic, or a practice running several sites
  //    under one domain, resolve to a single person.
  const name = candidate.normalizedName;
  const host = candidate.host;
  if (name && host) {
    for (const person of known) {
      if (person.normalizedName !== name) continue;
      if (person.hosts.some((h) => h && h.toLowerCase() === host)) {
        return { personId: person.id, basis: "name_and_host" };
      }
    }
  }

  // A name on its own is not evidence of identity.
  return null;
}
