import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Per-organization "company profile": who the sender is, what they sell, how
 * they do it, and who they target. Captured during first-run onboarding and
 * editable afterwards in Settings. Stored as an org-scoped `SystemSetting` row
 * (key `company.profile`) — the same pattern the scoring config and email voice
 * use, so no schema migration is needed.
 *
 * This is SENDER context. It shapes the outreach email's framing and makes the
 * copy reflect the real business, but it NEVER relaxes the evidence/grounding
 * rules in the system prompt: clinic-specific claims still have to map to real
 * findings, the profile is never presented as a fact about the recipient, and
 * drafting stays drafts-only.
 *
 * The presence of this settings row also doubles as the "onboarding completed"
 * signal (see `isOrgOnboarded`): the onboarding flow always writes it, so a
 * fresh org has no row and is routed through onboarding on first login.
 */

export const COMPANY_PROFILE_SETTING_KEY = "company.profile";

export interface CompanyProfile {
  /** What the company does, in the sender's own words. */
  companyDescription: string | null;
  /** The product or service being sold. */
  offer: string | null;
  /** How the company delivers it / its approach. */
  method: string | null;
  /** Who / where the sender wants to target (their ideal customer). */
  targetAudience: string | null;
  /** Company website. */
  websiteUrl: string | null;
  /** LinkedIn page or profile. */
  linkedinUrl: string | null;
  /** Other social links or handles, one per line. */
  socialLinks: string[];
}

/** Empty profile — reproduces pre-onboarding behavior (no extra sender context). */
export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyDescription: null,
  offer: null,
  method: null,
  targetAudience: null,
  websiteUrl: null,
  linkedinUrl: null,
  socialLinks: [],
};

/** Trim + cap a free-text field to `max`, coercing empty/non-string to null. */
const text = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t.slice(0, max) : null;
  }, z.string().nullable());

/**
 * One entry per line (textarea) or a stored string[]. Trims, drops blanks, caps
 * each entry length and the total count. Kept lenient (not URL-validated) so a
 * user can paste "linkedin.com/in/x" or a plain handle without being blocked.
 */
const lines = (max: number, maxCount: number) =>
  z.preprocess(
    (v) => {
      const arr = typeof v === "string" ? v.split("\n") : Array.isArray(v) ? v : [];
      return arr
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, maxCount)
        .map((s) => s.slice(0, max));
    },
    z.array(z.string()).default([]),
  );

/**
 * Parses either a stored settings row (`value` JSON) or raw form fields into a
 * complete `CompanyProfile`. `.catch` is not needed here because every field is
 * nullable/defaulted, so a partial or legacy value degrades gracefully.
 */
export const companyProfileSchema = z.object({
  companyDescription: text(600),
  offer: text(600),
  method: text(600),
  targetAudience: text(400),
  websiteUrl: text(300),
  linkedinUrl: text(300),
  socialLinks: lines(300, 10),
});

/** Read an org's stored company profile, or the empty defaults when unset. */
export async function loadCompanyProfile(orgId: string): Promise<CompanyProfile> {
  const row = await prisma.systemSetting.findUnique({
    where: { orgId_key: { orgId, key: COMPANY_PROFILE_SETTING_KEY } },
  });
  if (!row) return DEFAULT_COMPANY_PROFILE;
  const parsed = companyProfileSchema.safeParse(row.value);
  return parsed.success ? { ...DEFAULT_COMPANY_PROFILE, ...parsed.data } : DEFAULT_COMPANY_PROFILE;
}

/**
 * Whether the org has completed first-run onboarding. Onboarding (and the "skip"
 * action) always writes the `company.profile` row, so its existence is the gate.
 * Selects only the id — this runs on every dashboard navigation.
 */
export async function isOrgOnboarded(orgId: string): Promise<boolean> {
  const row = await prisma.systemSetting.findUnique({
    where: { orgId_key: { orgId, key: COMPANY_PROFILE_SETTING_KEY } },
    select: { id: true },
  });
  return row != null;
}
