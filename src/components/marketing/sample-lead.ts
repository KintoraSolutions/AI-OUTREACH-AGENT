import { buildAuditFindings, type AuditInput } from "@/lib/scoring/audit";
import { toScorableFindings } from "@/lib/scoring/adapters";
import { scoreClinic } from "@/lib/scoring/engine";
import { defaultScoringConfig } from "@/lib/scoring/rules";

/**
 * The clinic the landing page follows, and its score.
 *
 * The figures used to carry hand-written findings and hand-written subtotals.
 * A QA pass recomputed them against the real engine and they did not survive:
 * two findings were shown at a confidence `buildAuditFindings` never assigns,
 * one rejected row described a rule that cannot be rejected, "Combined" was
 * printed where `recommend()` returns "Phone operations", and the categories
 * showed 0 for software and 2 for contactability when the observations listed
 * directly above them would have fired four more rules.
 *
 * The page's loudest claim is that scoring is deterministic and inspectable.
 * Hand-maintained numbers cannot keep that promise, so none are maintained
 * here. The only thing written by hand is `SAMPLE_AUDIT_INPUT`, which is the
 * same shape the research step produces for a real clinic. Everything the page
 * prints after that is computed, at render time, by the same functions the
 * product runs: `buildAuditFindings`, then `scoreClinic` against the default
 * config. If a rule, a multiplier or a cap changes, the page changes with it.
 *
 * This module is imported only by server components, so pulling in the scoring
 * library costs the client bundle nothing. It deliberately uses
 * `defaultScoringConfig()` from `rules.ts` rather than `resolveScoringConfig`
 * from `config.ts`, because the latter imports the Prisma client and the
 * marketing page must not reach for a database.
 *
 * The clinic is invented. Publishing a named real business beside a low score
 * would be a different kind of dishonesty from the one this file fixes.
 */
export const SAMPLE_CLINIC_NAME = "Riverbend Family Optometry";
export const SAMPLE_CLINIC_ADDRESS = "448 Oxford St E, London, ON";
export const SAMPLE_CLINIC_SITE = "riverbendoptometry.ca";

/**
 * A clinic that books by phone across three locations, with no online booking
 * and a site that predates responsive layout. Ordinary, and the kind of
 * practice the product is pointed at.
 */
export const SAMPLE_AUDIT_INPUT: AuditInput = {
  discoverySourceUrl: "https://maps.google.com/?cid=sample",
  websiteUrl: `https://${SAMPLE_CLINIC_SITE}`,
  siteReachable: true,
  // "Optometry" is one of CLINIC_CATEGORIES. Spelling it "Optometrist" would
  // silently downgrade fit_is_healthcare from Verified to Strong inference.
  category: "Optometry",
  locationCount: 3,
  phones: ["+1 519 555 0142"],
  mainPhone: "+1 519 555 0142",
  publicEmail: "reception@riverbendoptometry.ca",
  hasDecisionMakerEmail: false,
  bookingMethod: "Call to book",
  withinGeography: true,
  performance: null,
  site: {
    title: "Riverbend Family Optometry",
    metaDescription: "Family eye care in London, Ontario.",
    publicEmails: ["reception@riverbendoptometry.ca"],
    phones: ["+1 519 555 0142"],
    contactPageUrl: `https://${SAMPLE_CLINIC_SITE}/contact`,
    onlineBookingUrl: null,
    bookingMethod: "Call to book",
    socialLinks: {},
    services: ["Eye exams", "Contact lenses", "Frames"],
    locations: [
      { label: "Oxford Street", address: "448 Oxford St E, London, ON", phone: null },
      { label: "Wonderland", address: "1200 Wonderland Rd N, London, ON", phone: null },
      { label: "Hyde Park", address: "95 Gainsborough Rd, London, ON", phone: null },
    ],
    hasViewportMeta: false,
    hasContactForm: false,
    isHttps: true,
    bookingPlatform: null,
    bookingPlatforms: [],
    hasDownloadableForms: false,
    mentionsReferral: false,
    mentionsDepartments: false,
    linkCount: 24,
  },
};

/** Exactly what the research step would record for that clinic. */
export const SAMPLE_FINDINGS = buildAuditFindings(SAMPLE_AUDIT_INPUT);

/** Exactly what the scoring engine returns for those findings. */
export const SAMPLE_SCORE = scoreClinic(
  toScorableFindings(SAMPLE_FINDINGS),
  defaultScoringConfig(),
);

/** The per-category caps the meters are drawn against. */
export const SAMPLE_CAPS = defaultScoringConfig().categoryCaps;
